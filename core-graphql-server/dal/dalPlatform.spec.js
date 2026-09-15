const chaiExpect = require('chai').expect;
const _ = require('lodash');
const sinon = require('sinon');
const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

const { supportedEvents } = require('@veritone/core-server-base/events-map');
const dal = require('./dalPlatform.js')(serviceContext);

describe('dalPlatform.js', function () {
  describe('#require', function () {
    it('should load module', async function () {
      chaiExpect(typeof dal).to.equal('object');
      chaiExpect(Object.keys(dal).length).to.equal(18);
      chaiExpect(typeof dal.addPlatformVersion).to.equal('function');
      chaiExpect(typeof dal.getAIWAREVersion).to.equal('function');
      chaiExpect(typeof dal.getPlatformProperties).to.equal('function');
      chaiExpect(typeof dal.setPlatformProperties).to.equal('function');
      chaiExpect(typeof dal.setCurrentPlatformVersion).to.equal('function');
      chaiExpect(typeof dal.getAIWAREVersionHistory).to.equal('function');
      chaiExpect(typeof dal.getAIWAREVersionList).to.equal('function');
      chaiExpect(typeof dal._getAIWAREVersionHistorySql).to.equal('function');
    });
  });

  describe('#require', function () {
    it('should add platform version', async function () {
      const context = mockUtil.makeContext();

      // version comparison call
      serviceContext.dbConnections['core'].read._push(
        [
          {
            result: 1,
            current_version: '',
            is_existing: '0',
            is_installable: '0'
          }
        ],
        false
      );

      // create platform version call
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '12345678-1234-1234-1234-123456789123',
            version: '1.0.0',
            manifestUrl:
              'https://s3.example.com/aiware/versions/1.2.0/manifest.yaml',
            changeLogUrl:
              'https://s3.example.com/aiware/versions/1.2.0/changelog.txt',
            highlightsUrl:
              'https://s3.example.com/aiware/versions/1.2.0/highlights.txt'
          }
        ],
        false
      );

      const addedPlatformVersion = await dal.addPlatformVersion(context, {
        input: {
          version: '1.0.0',
          manifestUrl:
            'https://s3.example.com/aiware/versions/1.0.0/manifest.yaml',
          changeLogUrl:
            'https://s3.example.com/aiware/versions/1.0.0/changelog.txt',
          highlightsUrl:
            'https://s3.example.com/aiware/versions/1.0.0/highlights.txt'
        },
        organizationId: '1'
      });

      chaiExpect(addedPlatformVersion.version).to.equal('1.0.0');
      chaiExpect(addedPlatformVersion.id).to.equal(
        '12345678-1234-1234-1234-123456789123'
      );
    });

    it('should add platform version with prerelease section', async function () {
      const context = mockUtil.makeContext();

      // version comparison call
      serviceContext.dbConnections['core'].read._push(
        [
          {
            result: 1,
            current_version: '',
            is_existing: '0',
            is_installable: '0'
          }
        ],
        false
      );

      // create platform version call
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: '12345678-1234-1234-1234-123456789123',
            version: '1.0.0-alpha',
            manifestUrl:
              'https://s3.example.com/aiware/versions/1.2.0/manifest.yaml',
            changeLogUrl:
              'https://s3.example.com/aiware/versions/1.2.0/changelog.txt',
            highlightsUrl:
              'https://s3.example.com/aiware/versions/1.2.0/highlights.txt'
          }
        ],
        false
      );

      const addedPlatformVersion = await dal.addPlatformVersion(context, {
        input: {
          version: '1.0.0-alpha',
          manifestUrl:
            'https://s3.example.com/aiware/versions/1.0.0/manifest.yaml',
          changeLogUrl:
            'https://s3.example.com/aiware/versions/1.0.0/changelog.txt',
          highlightsUrl:
            'https://s3.example.com/aiware/versions/1.0.0/highlights.txt'
        },
        organizationId: '1'
      });
      chaiExpect(serviceContext.messageUtil._messages().length).to.equal(2);
      const {
        actionName,
        actionResult
      } = serviceContext.messageUtil._messages()[0].actionInfo;
      chaiExpect(actionName).to.equal('create');
      chaiExpect(actionResult).to.equal('success');
      chaiExpect(addedPlatformVersion.version).to.equal('1.0.0-alpha');
      chaiExpect(addedPlatformVersion.id).to.equal(
        '12345678-1234-1234-1234-123456789123'
      );
    });

    it('should get platform versions', async function () {
      const context = mockUtil.makeContext();

      // get platform data
      serviceContext.dbConnections['core'].read._push(
        [
          {
            version_state: 'Current',
            id: '12345678-1234-1234-1234-123456789121',
            version: '1.0.1',
            manifest_url:
              'https://s3.example.com/aiware/versions/1.0.1/manifest.yaml',
            change_log_url:
              'https://s3.example.com/aiware/versions/1.0.1/changelog.txt',
            highlight_url:
              'https://s3.example.com/aiware/versions/1.0.1/highlights.txt',
            original_manifest_url:
              'https://s3.example.com/aiware/versions/1.0.1/manifest.yaml',
            original_change_log_url:
              'https://s3.example.com/aiware/versions/1.0.1/changelog.txt',
            original_highlight_url:
              'https://s3.example.com/aiware/versions/1.0.1/highlights.txt',
            created_by: '11111111-1111-1111-1111-111111111111',
            created_at: '5/10/2023',
            installed_by: '22222222-2222-2222-2222-222222222222',
            installed_at: '5/16/2023'
          },
          {
            version_state: 'Next',
            id: '22345678-1234-1234-1234-123456789122',
            version: '1.0.2',
            manifest_url:
              'https://s3.example.com/aiware/versions/1.0.2/manifest.yaml',
            change_log_url:
              'https://s3.example.com/aiware/versions/1.0.2/changelog.txt',
            highlight_url:
              'https://s3.example.com/aiware/versions/1.0.2/highlights.txt',
            original_manifest_url:
              'https://s3.example.com/aiware/versions/1.0.2/manifest.yaml',
            original_change_log_url:
              'https://s3.example.com/aiware/versions/1.0.2/changelog.txt',
            original_highlight_url:
              'https://s3.example.com/aiware/versions/1.0.2/highlights.txt',
            created_by: '11111111-1111-1111-1111-111111111111',
            created_at: '5/18/2023',
            installed_by: null,
            installed_at: null
          },
          {
            version_state: 'Previous',
            id: '32345678-1234-1234-1234-123456789123',
            version: '1.0.0',
            manifest_url:
              'https://s3.example.com/aiware/versions/1.0.0/manifest.yaml',
            change_log_url:
              'https://s3.example.com/aiware/versions/1.0.0/changelog.txt',
            highlight_url:
              'https://s3.example.com/aiware/versions/1.0.0/highlights.txt',
            original_manifest_url:
              'https://s3.example.com/aiware/versions/1.0.0/manifest.yaml',
            original_change_log_url:
              'https://s3.example.com/aiware/versions/1.0.0/changelog.txt',
            original_highlight_url:
              'https://s3.example.com/aiware/versions/1.0.0/highlights.txt',
            created_by: '11111111-1111-1111-1111-111111111111',
            created_at: '5/1/2023',
            installed_by: '22222222-2222-2222-2222-222222222222',
            installed_at: '5/12/2023'
          }
        ],
        false
      );

      const platformInfo = await dal.getAIWAREVersion(context, {
        organizationId: '1'
      });

      chaiExpect(platformInfo.aiWAREVersion.currentVersion.version).to.equal(
        '1.0.1'
      );
      chaiExpect(platformInfo.aiWAREVersion.previousVersion.version).to.equal(
        '1.0.0'
      );
      chaiExpect(platformInfo.aiWAREVersion.nextVersion.version).to.equal(
        '1.0.2'
      );

      chaiExpect(platformInfo.aiWAREVersion.currentVersion.id).to.equal(
        '12345678-1234-1234-1234-123456789121'
      );
      chaiExpect(platformInfo.aiWAREVersion.previousVersion.id).to.equal(
        '32345678-1234-1234-1234-123456789123'
      );
      chaiExpect(platformInfo.aiWAREVersion.nextVersion.id).to.equal(
        '22345678-1234-1234-1234-123456789122'
      );
    });

    it('should set current platform version', async function () {
      const context = mockUtil.makeContext();

      // version comparison call
      serviceContext.dbConnections['core'].read._push(
        [
          {
            result: 0,
            current_version: '1.0.0',
            is_existing: '1',
            is_installable: '1'
          }
        ],
        false
      );

      // set current platform write return data
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: '12345678-1234-1234-1234-123456789121',
            version: '1.0.1',
            manifest_url:
              'https://s3.example.com/aiware/versions/1.0.1/manifest.yaml',
            change_log_url:
              'https://s3.example.com/aiware/versions/1.0.1/changelog.txt',
            highlight_url:
              'https://s3.example.com/aiware/versions/1.0.1/highlights.txt',
            original_manifest_url:
              'https://s3.example.com/aiware/versions/1.0.1/manifest.yaml',
            original_change_log_url:
              'https://s3.example.com/aiware/versions/1.0.1/changelog.txt',
            original_highlight_url:
              'https://s3.example.com/aiware/versions/1.0.1/highlights.txt',
            created_by: '11111111-1111-1111-1111-111111111111',
            created_at: '5/10/2023',
            installed_by: '22222222-2222-2222-2222-222222222222',
            installed_at: '5/16/2023'
          }
        ],
        false
      );

      const platformInfo = await dal.setCurrentPlatformVersion(context, {
        version: '1.0.1',
        organizationId: '1'
      });
      chaiExpect(serviceContext.messageUtil._messages().length).to.equal(2);
      const {
        actionName,
        actionResult
      } = serviceContext.messageUtil._messages()[0].actionInfo;
      chaiExpect(actionName).to.equal('update');
      chaiExpect(actionResult).to.equal('success');
      chaiExpect(platformInfo.version).to.equal('1.0.1');
      chaiExpect(platformInfo.id).to.equal(
        '12345678-1234-1234-1234-123456789121'
      );
    });

    it('should get version history', async function () {
      const context = mockUtil.makeContext();

      // get version history
      serviceContext.dbConnections['core'].read._push(
        [
          {
            id: 'd7e69a1a-5f87-4e5f-9e4d-048dca4d6a80',
            version: '1.0.3',
            created_by: '11111111-1111-1111-1111-111111111111',
            created_at: '5/1/2023',
            installed_by: '22222222-2222-2222-2222-222222222222',
            installed_at: '5/13/2023',
            history_id: '30c9c2a2-ae6a-4be2-b80c-6893d8b56780',
            history_created_at: '5/17/2023'
          },
          {
            id: 'f4c7d1aa-08e5-4e46-aa7f-1ee66a9ac75b',
            version: '1.0.2',
            created_by: '11111111-1111-1111-1111-111111111111',
            created_at: '5/1/2023',
            installed_by: '22222222-2222-2222-2222-222222222222',
            installed_at: '5/12/2023',
            history_id: '7b8a2ab2-00de-4f1b-9fb1-99e7a9cd108f',
            history_created_at: '5/17/2023'
          },
          {
            id: '3f4a3cf7-7a06-4d7a-8f8b-e5cd6d0a685f',
            version: '1.0.1',
            created_by: '11111111-1111-1111-1111-111111111111',
            created_at: '5/1/2023',
            installed_by: '22222222-2222-2222-2222-222222222222',
            installed_at: '5/12/2023',
            history_id: 'd3499a78-efc7-4a72-a12d-852f53231e33',
            history_created_at: '5/17/2023'
          }
        ],
        false
      );

      const versionHistory = await dal.getAIWAREVersionHistory(context, {
        organizationId: '1'
      });

      chaiExpect(versionHistory).to.exist;
      chaiExpect(versionHistory.records).to.exist;
      chaiExpect(versionHistory.offset).to.exist;
      chaiExpect(versionHistory.limit).to.exist;
      chaiExpect(versionHistory.records.length).to.equal(3);
      const records = versionHistory.records;
      chaiExpect(records[0].platformVersion.version).to.equal('1.0.3');
      chaiExpect(records[1].platformVersion.version).to.equal('1.0.2');
      chaiExpect(records[2].platformVersion.version).to.equal('1.0.1');
    });

    it('should get a list of all versions (installed or not)', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].read._push([], false, [
        'ORDER BY installed_at DESC NULLS LAST'
      ]);
      const sortedByInstalledAt = await dal.getAIWAREVersionList(context, {
        orderBy: 'installedAt',
        orderDirection: 'desc'
      });
      chaiExpect(sortedByInstalledAt.aiWAREVersionList.count).to.equal(0);

      // get platform data
      serviceContext.dbConnections['core'].read._push(
        [
          {
            version_state: 'Next',
            id: '22345678-1234-1234-1234-123456789122',
            version: '1.0.2',
            manifest_url:
              'https://s3.example.com/aiware/versions/1.0.2/manifest.yaml',
            change_log_url:
              'https://s3.example.com/aiware/versions/1.0.2/changelog.txt',
            highlight_url:
              'https://s3.example.com/aiware/versions/1.0.2/highlights.txt',
            original_manifest_url:
              'https://s3.example.com/aiware/versions/1.0.2/manifest.yaml',
            original_change_log_url:
              'https://s3.example.com/aiware/versions/1.0.2/changelog.txt',
            original_highlight_url:
              'https://s3.example.com/aiware/versions/1.0.2/highlights.txt',
            created_by: '11111111-1111-1111-1111-111111111111',
            created_at: '5/18/2023',
            installed_by: null,
            installed_at: null
          },
          {
            version_state: 'Current',
            id: '12345678-1234-1234-1234-123456789121',
            version: '1.0.1',
            manifest_url:
              'https://s3.example.com/aiware/versions/1.0.1/manifest.yaml',
            change_log_url:
              'https://s3.example.com/aiware/versions/1.0.1/changelog.txt',
            highlight_url:
              'https://s3.example.com/aiware/versions/1.0.1/highlights.txt',
            original_manifest_url:
              'https://s3.example.com/aiware/versions/1.0.1/manifest.yaml',
            original_change_log_url:
              'https://s3.example.com/aiware/versions/1.0.1/changelog.txt',
            original_highlight_url:
              'https://s3.example.com/aiware/versions/1.0.1/highlights.txt',
            created_by: '11111111-1111-1111-1111-111111111111',
            created_at: '5/10/2023',
            installed_by: '22222222-2222-2222-2222-222222222222',
            installed_at: '5/16/2023'
          },
          {
            version_state: 'Previous',
            id: '32345678-1234-1234-1234-123456789123',
            version: '1.0.0',
            manifest_url:
              'https://s3.example.com/aiware/versions/1.0.0/manifest.yaml',
            change_log_url:
              'https://s3.example.com/aiware/versions/1.0.0/changelog.txt',
            highlight_url:
              'https://s3.example.com/aiware/versions/1.0.0/highlights.txt',
            original_manifest_url:
              'https://s3.example.com/aiware/versions/1.0.0/manifest.yaml',
            original_change_log_url:
              'https://s3.example.com/aiware/versions/1.0.0/changelog.txt',
            original_highlight_url:
              'https://s3.example.com/aiware/versions/1.0.0/highlights.txt',
            created_by: '11111111-1111-1111-1111-111111111111',
            created_at: '5/1/2023',
            installed_by: '22222222-2222-2222-2222-222222222222',
            installed_at: '5/12/2023'
          }
        ],
        false,
        ['ORDER BY created_at DESC']
      );
      const sortedByCreatedAt = await dal.getAIWAREVersionList(context, {
        orderBy: 'createdAt',
        orderDirection: 'desc'
      });

      chaiExpect(sortedByCreatedAt.aiWAREVersionList.count).to.equal(3);
      chaiExpect(
        sortedByCreatedAt.aiWAREVersionList.records[0].version
      ).to.equal('1.0.2');
      chaiExpect(
        sortedByCreatedAt.aiWAREVersionList.records[1].version
      ).to.equal('1.0.1');
      chaiExpect(
        sortedByCreatedAt.aiWAREVersionList.records[2].version
      ).to.equal('1.0.0');
    });

    it('addPlatformVersion should fail on missing the required version field', async function () {
      const context = mockUtil.makeContext();
      let resp, err;
      try {
        resp = await dal.addPlatformVersion(context, {
          input: {
            manifestUrl:
              'https://s3.example.com/aiware/versions/1.0.0/manifest.yaml'
          },
          organizationId: '1'
        });
      } catch (error) {
        err = error;
      }

      chaiExpect(serviceContext.messageUtil._messages().length).to.equal(1);
      const {
        actionName,
        actionResult
      } = serviceContext.messageUtil._messages()[0].actionInfo;
      chaiExpect(actionName).to.equal('create');
      chaiExpect(actionResult).to.equal('failure');
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(resp).not.to.exist;
    });

    it('addPlatformVersion should fail on invalid UUID format', async function () {
      const context = mockUtil.makeContext();
      let resp, err;
      try {
        resp = await dal.addPlatformVersion(context, {
          input: {
            id: '12345678-1234-1234-1234-12345678912',
            version: '1.0.0',
            manifestUrl:
              'https://s3.example.com/aiware/versions/1.0.0/manifest.yaml'
          },
          organizationId: '1'
        });
      } catch (error) {
        err = error;
      }
      chaiExpect(err.name).to.equal('invalid_input');
      chaiExpect(resp).not.to.exist;
    });

    it('setCurrentPlatformVersion should fail on missing version number', async function () {
      const context = mockUtil.makeContext();

      try {
        const currentPlatformVersion = await dal.setCurrentPlatformVersion(
          context,
          {
            organizationId: '1'
          }
        );
      } catch (err) {
        chaiExpect(serviceContext.messageUtil._messages().length).to.equal(2);
        const {
          actionName,
          actionResult
        } = serviceContext.messageUtil._messages()[0].actionInfo;
        chaiExpect(actionName).to.equal('update');
        chaiExpect(actionResult).to.equal('failure');
        chaiExpect(err.name).to.equal('invalid_input');
      }
    });

    it('setCurrentPlatformVersion should fail on non existing version number', async function () {
      const context = mockUtil.makeContext();

      // version comparison call
      serviceContext.dbConnections['core'].read._push(
        [
          {
            result: 1,
            current_version: '1.0.0',
            is_existing: '0',
            is_installable: '0'
          }
        ],
        false
      );

      try {
        const currentPlatformVersion = await dal.setCurrentPlatformVersion(
          context,
          {
            version: '1.0.3',
            organizationId: '1'
          }
        );
      } catch (err) {
        chaiExpect(err.name).to.equal('Error');
      }
    });

    it('setPlatformProperties should set the platform properties successfully', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].write._push([
        {
          jsonProperties: {
            somePropertyOne: 'Value of Property 1',
            somePropertyTwo: 'Value of Property 2',
            somePropertyThree: 3.0
          },
          modifiedBy: 'System',
          modifiedAt: new Date().toISOString()
        }
      ]);

      const pltformProperties = await dal.setPlatformProperties(context, {
        properties: {
          somePropertyOne: 'Value of Property 1',
          somePropertyTwo: 'Value of Property 2',
          somePropertyThree: 3.0
        }
      });

      chaiExpect(pltformProperties.properties.somePropertyOne).to.equal(
        'Value of Property 1'
      );
      chaiExpect(pltformProperties.properties.somePropertyTwo).to.equal(
        'Value of Property 2'
      );
      chaiExpect(pltformProperties.properties.somePropertyThree).to.equal(3.0);
    });

    it('setPlatformProperties should thrwo an error when no properties are submitted', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].write._push([
        {
          jsonProperties: {
            somePropertyOne: 'Value of Property 1',
            somePropertyTwo: 'Value of Property 2',
            somePropertyThree: 3.0
          },
          modifiedBy: 'System',
          modifiedAt: new Date().toISOString()
        }
      ]);

      try {
        const pltformProperties = await dal.setPlatformProperties(context, {});
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
      }
    });

    it('setPlatformProperties should set the platform properties successfully', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].write._push([
        {
          jsonProperties: {
            somePropertyOne: 'Value of Property 1',
            somePropertyTwo: 'Value of Property 2',
            somePropertyThree: 3.0
          },
          modifiedBy: 'System',
          modifiedAt: new Date().toISOString()
        }
      ]);

      const pltformProperties = await dal.setPlatformProperties(context, {
        properties: {
          somePropertyOne: 'Value of Property 1',
          somePropertyTwo: 'Value of Property 2',
          somePropertyThree: 3.0
        }
      });

      chaiExpect(pltformProperties.properties.somePropertyOne).to.equal(
        'Value of Property 1'
      );
      chaiExpect(pltformProperties.properties.somePropertyTwo).to.equal(
        'Value of Property 2'
      );
      chaiExpect(pltformProperties.properties.somePropertyThree).to.equal(3.0);
    });

    it('setPlatformProperties should thrwo an error when no properties are submitted', async function () {
      const context = mockUtil.makeContext();

      serviceContext.dbConnections['core'].write._push([
        {
          jsonProperties: {
            somePropertyOne: 'Value of Property 1',
            somePropertyTwo: 'Value of Property 2',
            somePropertyThree: 3.0
          },
          modifiedBy: 'System',
          modifiedAt: new Date().toISOString()
        }
      ]);

      try {
        const pltformProperties = await dal.setPlatformProperties(context, {});
      } catch (err) {
        chaiExpect(err.name).to.equal('invalid_input');
      }
    });
  });

  describe('#_getAIWAREVersionHistorySql', function () {
    it('No options to filter', async function () {
      const {
        sql,
        sqlArgs,
        pageArgs
      } = await dal._getAIWAREVersionHistorySql();
      chaiExpect(sql).to.exist;
      chaiExpect(sqlArgs).to.exist;
      chaiExpect(pageArgs).to.exist;

      chaiExpect(sql).to.include(`aiware.aiware_version`);
      chaiExpect(sql).to.include(`aiware.aiware_version_history`);
      chaiExpect(sql).to.not.include(`WHERE`);
      chaiExpect(sqlArgs.length).to.equal(2);
      chaiExpect(pageArgs.limit).to.equal(30);
      chaiExpect(pageArgs.offset).to.equal(0);
    });

    it('filter by version ids', async function () {
      const { sql, sqlArgs, pageArgs } = await dal._getAIWAREVersionHistorySql({
        ids: ['54713667-bce0-4ba8-a9d8-5f3d7f455d38']
      });
      chaiExpect(sql).to.exist;
      chaiExpect(sqlArgs).to.exist;
      chaiExpect(pageArgs).to.exist;

      chaiExpect(sql).to.include(`aiware.aiware_version`);
      chaiExpect(sql).to.include(`aiware.aiware_version_history`);
      chaiExpect(sqlArgs.length).to.equal(3);
      chaiExpect(sqlArgs[0][0]).to.equal(
        '54713667-bce0-4ba8-a9d8-5f3d7f455d38'
      );
      chaiExpect(pageArgs.limit).to.equal(30);
      chaiExpect(pageArgs.offset).to.equal(0);

      chaiExpect(sql).to.include(`WHERE`);
      chaiExpect(sql).to.include(`v.id = ANY(`);
      chaiExpect(sql).to.include(`$3`);
    });

    it('filter by version ids, version', async function () {
      const { sql, sqlArgs, pageArgs } = await dal._getAIWAREVersionHistorySql({
        ids: ['54713667-bce0-4ba8-a9d8-5f3d7f455d38'],
        versions: ['v1.1.2']
      });
      chaiExpect(sql).to.exist;
      chaiExpect(sqlArgs).to.exist;
      chaiExpect(pageArgs).to.exist;

      chaiExpect(sql).to.include(`aiware.aiware_version`);
      chaiExpect(sql).to.include(`aiware.aiware_version_history`);
      chaiExpect(sqlArgs.length).to.equal(4);
      chaiExpect(sqlArgs[0][0]).to.equal(
        '54713667-bce0-4ba8-a9d8-5f3d7f455d38'
      );
      chaiExpect(sqlArgs[1][0]).to.equal('v1.1.2');
      chaiExpect(pageArgs.limit).to.equal(30);
      chaiExpect(pageArgs.offset).to.equal(0);

      chaiExpect(sql).to.include(`WHERE`);
      chaiExpect(sql).to.include(`v.id = ANY(`);
      chaiExpect(sql).to.include(`v.version = ANY(`);
      chaiExpect(sql).to.include(`$3`);
      chaiExpect(sql).to.include(`$4`);
    });
  });
  describe('#createInstanceLoginConfiguration', () => {
    it('should create new login configuration', async () => {
      const inputConfig = {
        enabled: true,
        name: 'Test Login Config',
        slug: 'test-login-slug',
        logo:
          'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC',
        buttonColor: '#0000FF',
        buttonTextColor: '#FFFFFF'
      };

      const context = mockUtil.makeContext();

      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            enabled: inputConfig.enabled,
            name: inputConfig.name,
            slug: inputConfig.slug,
            logo: inputConfig.logo,
            login_button_style: {
              buttonColor: inputConfig.buttonColor,
              buttonTextColor: inputConfig.buttonTextColor
            }
          }
        ],
        false
      );

      const res = await dal.createInstanceLoginConfiguration(
        context,
        inputConfig
      );

      chaiExpect(res).to.include(inputConfig);
      chaiExpect(res.organizationInfo).to.not.exist;
    });
  });
  describe('#updateInstanceLoginConfiguration', () => {
    it('should update login configuration', async () => {
      const returnConfig = {
        enabled: true,
        name: 'Test Login Config',
        slug: 'test-login-slug-updated',
        logo:
          'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC',
        buttonColor: '#0000FF',
        buttonTextColor: '#FFFFFF'
      };

      const context = mockUtil.makeContext();

      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            enabled: returnConfig.enabled,
            name: returnConfig.name,
            slug: returnConfig.slug,
            logo: returnConfig.logo,
            login_button_style: {
              buttonColor: returnConfig.buttonColor,
              buttonTextColor: returnConfig.buttonTextColor
            }
          }
        ],
        false
      );

      const res = await dal.createInstanceLoginConfiguration(
        context,
        { slug: 'test-login-slug-updated' },
        'test-login-slug'
      );

      chaiExpect(res).to.include(returnConfig);
      chaiExpect(res.organizationInfo).to.not.exist;
    });
  });
  describe('#getInstanceLoginConfigurations', () => {
    it('should update login configuration', async () => {
      const returnConfigs = [
        {
          enabled: true,
          name: 'Test Login Config',
          slug: 'test-login-slug-updated-1'
        },
        {
          enabled: true,
          name: 'Test Login Config',
          slug: 'test-login-slug-updated-2'
        },
        {
          enabled: true,
          name: 'Test Login Config',
          slug: 'test-login-slug-updated-3'
        }
      ];

      serviceContext.dbConnections['media_platform'].read._push(
        returnConfigs,
        false
      );

      const res = await dal.getInstanceLoginConfigurations();

      chaiExpect(res.limit).to.equal(30);
      chaiExpect(res.offset).to.equal(0);
      chaiExpect(res.count).to.equal(3);
      chaiExpect(res.records[0]).to.include(returnConfigs[0]);
      chaiExpect(res.records[0].organizationInfo).to.not.exist;
      chaiExpect(res.records[1]).to.include(returnConfigs[1]);
      chaiExpect(res.records[1].organizationInfo).to.not.exist;
      chaiExpect(res.records[2]).to.include(returnConfigs[2]);
      chaiExpect(res.records[2].organizationInfo).to.not.exist;
    });
  });
  describe('#deleteInstanceLoginConfiguration', () => {
    it('should delete instance login config', async function () {
      const loginConfig = {
        slug: 'test-slug',
        name: 'Test Login Config'
      };
      let res, err;
      let message = `Instance Login Configuration (slug: ${loginConfig.slug}, name: '${loginConfig.name}') has been deleted`;
      const context = mockUtil.makeContext();

      let args = {
        slug: loginConfig.slug
      };
      serviceContext.dbConnections['media_platform'].write._push([
        {
          slug: loginConfig.slug,
          name: loginConfig.name
        }
      ]);
      try {
        res = await dal.deleteInstanceLoginConfiguration(context, args);
      } catch (error) {
        err = error;
      }
      chaiExpect(err).to.not.exist;
      chaiExpect(res).to.exist;
      chaiExpect(typeof res).to.equal('object');
      chaiExpect(res.id).to.equal(loginConfig.slug);
      chaiExpect(res.message).to.equal(message);
    });

    it('should throw error if no results return', async function () {
      const loginConfig = {
        slug: 'test-slug',
        name: 'Test Login Config'
      };
      let res, err;
      let message =
        'Instance Login configuration associated with the provided slug not found.';
      const context = mockUtil.makeContext();

      let args = {
        slug: loginConfig.slug
      };
      serviceContext.dbConnections['media_platform'].write._push([]);
      try {
        res = await dal.deleteInstanceLoginConfiguration(context, args);
      } catch (error) {
        err = error;
      }
      chaiExpect(res).to.not.exist;
      chaiExpect(err.message).to.equal(message);
      chaiExpect(err.data.slug).to.equal(loginConfig.slug);
    });
  });

  const info = {
    schema: {
      _typeMap: {
        EventNameEnum: {
          _values: [{ name: 'LoginSucceeded' }, { name: 'ClusterDelete' }]
        }
      }
    }
  };

  describe('#instanceAuditLogConfig', () => {
    it('should return audit log config', async () => {
      const context = mockUtil.makeContext();
      const dbEvents = {
        baseline: 'audit_login_success',
        configured: 'cluster_delete'
      };
      serviceContext.dbConnections['core'].read._push(
        [
          {
            baselineEvents: [dbEvents.baseline],
            configuredEvents: [dbEvents.configured]
          }
        ],
        false
      );
      const res = await dal.instanceAuditLogConfig(context, {}, info);
      chaiExpect(res.immutableEvents).to.include(
        dal.reversedEventsMap[dbEvents.baseline]
      );
      chaiExpect(res.configurableEvents).to.include(
        dal.reversedEventsMap[dbEvents.configured]
      );
    });
    it('should return updated audit log config', async () => {
      const eventToRemove = 'ClusterCreate';
      const eventToAdd = 'ClusterDelete';
      const args = {
        addAuditEvents: [eventToRemove],
        removeAuditEvents: [eventToAdd]
      };

      const context = mockUtil.makeContext();

      const dbEvents = {
        baseline: 'audit_login_success',
        configured: 'cluster_delete'
      };
      const emitPublicEventSpy = sinon.spy(
        serviceContext.messageUtil,
        'emitPublicEvent'
      );
      serviceContext.dbConnections['core'].read._push(
        [
          {
            baselineEvents: [dbEvents.baseline],
            configuredEvents: [dbEvents.configured]
          }
        ],
        false
      );
      // audit_login_success converts to gql enum auditLoginSuccess
      const res = await dal.updateInstanceAuditLogConfig(context, args, info);
      sinon.assert.calledOnce(emitPublicEventSpy);
      // public event should have been called with the correct event
      sinon.assert.calledWith(
        emitPublicEventSpy,
        sinon.match(supportedEvents.AuditLogConfigChange),
        sinon.match.any,
        sinon.match.any,
        sinon.match(
          (event) =>
            event.actionInfo && event.actionInfo.actionResult === 'success'
        )
      );
      emitPublicEventSpy.restore();
      chaiExpect(res.immutableEvents).to.include(
        dal.reversedEventsMap[dbEvents.baseline]
      );
      // cluster_delete converts to gql enum clusterDelete
      chaiExpect(res.configurableEvents).to.include(
        dal.reversedEventsMap[dbEvents.configured]
      );
    });
    it('should return invalid input error when adding/deleting the same event', async () => {
      const emitPublicEventSpy = sinon.spy(
        serviceContext.messageUtil,
        'emitPublicEvent'
      );
      const args = {
        addAuditEvents: ['clusterDelete'],
        removeAuditEvents: ['clusterDelete']
      };
      const context = mockUtil.makeContext();
      dal.updateInstanceAuditLogConfig(context, args).catch((err) => {
        sinon.assert.calledWith(
          emitPublicEventSpy,
          sinon.match(supportedEvents.AuditLogConfigChange),
          sinon.match.any,
          sinon.match.any,
          sinon.match(
            (event) =>
              event.actionInfo && event.actionInfo.actionResult === 'failure'
          )
        );
        chaiExpect(err.name).to.equal('invalid_input');
      });
    });
    it('should throw invalid input if all events passed in for the update are not found in the eventsMap', async () => {
      const args = {
        addAuditEvents: ['nonExistingEvent'],
        removeAuditEvents: ['anotherNonExistingEvent']
      };
      const context = mockUtil.makeContext();
      dal.updateInstanceAuditLogConfig(context, args).catch((err) => {
        chaiExpect(err.name).to.equal('invalid_input');
      });
    });
    it('should log an error in case unrecognized event is passed into the mutation', async () => {
      const loggerSpy = sinon.spy(serviceContext.logger, 'error');
      const unrecognizedEvent = 'unrecognizedEvent';
      const args = {
        addAuditEvents: [unrecognizedEvent],
        removeAuditEvents: ['ClusterDelete']
      };
      const context = mockUtil.makeContext();
      const dbEvents = {
        baseline: 'audit_login_success',
        configured: 'cluster_delete'
      };
      serviceContext.dbConnections['core'].read._push(
        [
          {
            baselineEvents: [dbEvents.baseline],
            configuredEvents: [dbEvents.configured]
          }
        ],
        false
      );
      await dal.updateInstanceAuditLogConfig(context, args).catch((err) => {
        chaiExpect(err.name).to.equal('invalid_input');
        chaiExpect(err.message).to.include(
          `One or more events are not supported for audit logging:`
        );
      });
      sinon.assert.calledOnce(loggerSpy);
      sinon.assert.calledWith(
        loggerSpy,
        sinon.match(
          `Event ${unrecognizedEvent} is not found in the events map`
        )
      );
      loggerSpy.restore();
    });
  });

  describe('#AuditLogExportRequest', () => {
    afterEach(() => {
      sinon.restore();
      serviceContext.dbConnections['core'].read._clearResultQueue();
      serviceContext.dbConnections['core'].write._clearResultQueue();
    });
    describe('#createAuditLogExportRequest', () => {
      it('should not return an error when mutation parameters are missing as all filters are optional with org id set automatically', async () => {
        const context = mockUtil.makeContext();
        const {
          userId,
          organization: { organizationId }
        } = context._authInfo;

        // read when checking if renamed
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        // read when retrieving orgs
        serviceContext.dbConnections['media_platform'].read._push(
          [{ organizationId }],
          false
        );
        // no pending export requests
        serviceContext.dbConnections['core'].read._push([], false);
        // notification mailbox exists
        serviceContext.dbConnections['core'].read._push(
          [
            {
              id: '1sdf-1234-1234-1234-123456789123'
            }
          ],
          false
        );
        const newExportId = '2sdf-1234-1234-1234-123456789123';
        // insert an export
        serviceContext.dbConnections['core'].write._push(
          [
            {
              id: newExportId
            }
          ],
          false
        );
        const dbWriteSpy = sinon.spy(
          serviceContext.dbConnections['core'].write,
          'map'
        );
        let resp, error;
        await dal
          .createAuditLogExportRequest(context)
          .then((response) => {
            resp = response;
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).not.to.exist;
        chaiExpect(resp).to.exist;
        sinon.assert.calledOnce(dbWriteSpy);
        sinon.assert.calledWith(
          dbWriteSpy,
          sinon.match.any,
          [
            sinon.match.any, // export id
            { organizationId }, // org id derived from the authContext even though it was not passed as a parameter
            'pending', // initial export status
            userId // requestor id
          ],
          sinon.match.any
        );
      });
      it('should return an error when either toDate or fromDate is missing', async () => {
        const context = mockUtil.makeContext();
        let error;
        await dal
          .createAuditLogExportRequest(context, {
            dateTimeFilter: {
              fromDateTime: '2024-12-04T19:29:45.847Z'
            }
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).to.exist;
        chaiExpect(error.message).to.equal(
          'fromDateTime and toDateTime are required fields.'
        );
      });
      it('should return an error when either date is invalid', async () => {
        const context = mockUtil.makeContext();
        let error;
        await dal
          .createAuditLogExportRequest(context, {
            dateTimeFilter: {
              fromDateTime: 'XYZ',
              toDateTime: '2024-12-04T19:29:45.847Z'
            }
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).to.exist;
        chaiExpect(error.message).to.equal(
          'fromDateTime and toDateTime must be valid date strings.'
        );
      });
      it('should return an error when fromDate occurs after toDate', async () => {
        const context = mockUtil.makeContext();
        let error;
        await dal
          .createAuditLogExportRequest(context, {
            dateTimeFilter: {
              fromDateTime: '2024-12-04T19:29:45.847Z',
              toDateTime: '2024-11-04T19:29:45.847Z'
            }
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).to.exist;
        chaiExpect(error.message).to.equal(
          'fromDateTime must occur before toDateTime.'
        );
      });
      it('should throw when there is more than 12 months between fromDate and toDate if the respective feature flag is false', async () => {
        const context = mockUtil.makeContext();

        const sContextLessThan12MonthsExport = { ...serviceContext };
        sContextLessThan12MonthsExport.config.featureFlags.canExportLogsOlderThan12Months = false;

        const dalMoreThan12Mo_false = require('./dalPlatform.js')(
          sContextLessThan12MonthsExport
        );
        let resp, error;
        await dalMoreThan12Mo_false
          .createAuditLogExportRequest(context, {
            dateTimeFilter: {
              fromDateTime: '2023-11-04T19:29:45.847Z',
              toDateTime: '2024-12-04T19:29:45.847Z'
            }
          })
          .then((response) => {
            resp = response;
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).to.exist;
        chaiExpect(resp).not.to.exist;
      });
      it('should allow export when there is more than 12 months between fromDate and toDate if the respective feature flag is true', async () => {
        const context = mockUtil.makeContext();
        const sContextMoreThan12MonthsExport = {
          ...serviceContext
        };
        sContextMoreThan12MonthsExport.config.featureFlags.canExportLogsOlderThan12Months = true;
        const dalMoreThan12Mo_true = require('./dalPlatform.js')(
          sContextMoreThan12MonthsExport
        );
        // read when checking if renamed
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        // read when retrieving orgs
        serviceContext.dbConnections['media_platform'].read._push(
          [{ orgnazationId: 7682 }],
          false
        );
        // no pending export requests
        serviceContext.dbConnections['core'].read._push([], false);
        // notification mailbox exists
        serviceContext.dbConnections['core'].read._push(
          [
            {
              id: '1sdf-1234-1234-1234-123456789123'
            }
          ],
          false
        );
        const newExportId = '2sdf-1234-1234-1234-123456789123';
        // insert an export
        serviceContext.dbConnections['core'].write._push(
          [
            {
              id: newExportId
            }
          ],
          false
        );
        let resp, error;
        await dalMoreThan12Mo_true
          .createAuditLogExportRequest(context, {
            dateTimeFilter: {
              fromDateTime: '2023-11-04T19:29:45.847Z',
              toDateTime: '2024-12-04T19:29:45.847Z'
            }
          })
          .then((response) => {
            resp = response;
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).not.to.exist;
        chaiExpect(resp).to.exist;
      });
      it('should allow export when there is more than 12 months between fromDate and toDate if the respective feature flag is not set', async () => {
        const context = mockUtil.makeContext();
        const {
          canExportLogsOlderThan12Months,
          ...otherFlags
        } = serviceContext.config.featureFlags;

        const sContextMoreThan12MonthsExportNotSet = {
          ...serviceContext
        };
        sContextMoreThan12MonthsExportNotSet.config.featureFlags = otherFlags;
        const dalMoreThan12Mo_notSet = require('./dalPlatform.js')(
          sContextMoreThan12MonthsExportNotSet
        );
        // read when checking if renamed
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        // read when retrieving orgs
        serviceContext.dbConnections['media_platform'].read._push(
          [{ orgnazationId: 7682 }],
          false
        );
        // no pending export requests
        serviceContext.dbConnections['core'].read._push([], false);
        // notification mailbox exists
        serviceContext.dbConnections['core'].read._push(
          [
            {
              id: '1sdf-1234-1234-1234-123456789123'
            }
          ],
          false
        );
        const newExportId = '2sdf-1234-1234-1234-123456789123';
        // insert an export
        serviceContext.dbConnections['core'].write._push(
          [
            {
              id: newExportId
            }
          ],
          false
        );
        let resp, error;
        await dalMoreThan12Mo_notSet
          .createAuditLogExportRequest(context, {
            dateTimeFilter: {
              fromDateTime: '2023-11-04T19:29:45.847Z',
              toDateTime: '2024-12-04T19:29:45.847Z'
            }
          })
          .then((response) => {
            resp = response;
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).not.to.exist;
        chaiExpect(resp).to.exist;
      });
      it('should return an error when non-SA user requests export for another org', async () => {
        const context = mockUtil.makeContext();
        let error;
        context._authInfo = {
          organization: {
            organizationId: '1'
          }
        };
        await dal
          .createAuditLogExportRequest(context, {
            dateTimeFilter: {
              fromDateTime: '2024-11-04T19:29:45.847Z',
              toDateTime: '2024-12-04T19:29:45.847Z'
            },
            organizationId: '2'
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).to.exist;
        chaiExpect(error.message).to.equal(
          'Unable to validate export request org access for organizationId 2.'
        );
      });
      it('should return an error when organization export is requested for is not found', async () => {
        let error;
        const context = mockUtil.makeContext();
        context._authInfo = {
          organization: {
            organizationId: '2'
          }
        };
        // read when checking if renamed
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        // read when retrieving orgs
        serviceContext.dbConnections['media_platform'].read._push([], false);
        await dal
          .createAuditLogExportRequest(context, {
            dateTimeFilter: {
              fromDateTime: '2024-11-04T19:29:45.847Z',
              toDateTime: '2024-12-04T19:29:45.847Z'
            },
            organizationId: '2'
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).to.exist;
        chaiExpect(error.message).to.equal(
          'Unable to validate export request org access for organizationId 2.'
        );
      });
      it('should return error with an existing peding or in_progress export request id if one exists for the same org', async () => {
        let res, error;
        const existingExportRequestId = '6fa3cda4-3d55-44be-abd0-60e81c2bc6d1';
        const context = mockUtil.makeContext();
        // read when checking if renamed
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        // read when retrieving orgs
        serviceContext.dbConnections['media_platform'].read._push(
          [{ id: 2 }],
          false
        );
        // check if there's an existing request with the same filters
        serviceContext.dbConnections['core'].read._push(
          [
            {
              id: existingExportRequestId,
              filters: {
                organizationId: '2'
              },
              status: 'pending'
            }
          ],
          false
        );

        await dal
          .createAuditLogExportRequest(context, {
            organizationId: '2'
          })
          .then((response) => {
            res = response;
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).to.exist;
        chaiExpect(error.message).to.equal(
          `An export request for this organization already exists and it is in PENDING status. 
        Request ID: ${existingExportRequestId}. Please wait for the current request to complete or cancel it before creating a new one.`
        );
        chaiExpect(res).not.to.exist;
      });
      it('should persist request in db and emit an event when payload is valid, mailbox for updates exists', async () => {
        let res, error;
        const exportRequestId = '6fa3cda4-3d55-44be-abd0-60e81c2bc6d3';
        const context = mockUtil.makeContext();
        const createIfNotExistExportMailboxSpy = sinon.spy(
          serviceContext.bll.mailbox,
          'createMailboxIfNotExists'
        );
        const getMailboxesSpy = sinon.spy(
          serviceContext.dal.mailbox,
          'getMailboxes'
        );
        const createMailboxSpy = sinon.spy(
          serviceContext.dal.mailbox,
          'createMailbox'
        );
        // read when checking if renamed
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        // read when retrieving orgs
        serviceContext.dbConnections['media_platform'].read._push(
          [{ id: 2 }],
          false
        );
        // check if there's an existing request with the same filters
        serviceContext.dbConnections['core'].read._push([], false);
        // export status mailbox exists
        serviceContext.dbConnections['core'].read._push([{ id: '1' }], false);
        // write request into db
        serviceContext.dbConnections['core'].write._push(
          [
            {
              id: exportRequestId,
              filters: {
                dateTimeFilter: {
                  fromDateTime: 1730748585000,
                  toDateTime: 1733340585000
                }
              }
            }
          ],
          false
        );
        await dal
          .createAuditLogExportRequest(context, {
            dateTimeFilter: {
              fromDateTime: '2024-11-04T19:29:45.847Z',
              toDateTime: '2024-12-04T19:29:45.847Z'
            },
            organizationId: '2'
          })
          .then((response) => {
            res = response;
          })
          .catch((err) => {
            error = err;
          });
        // method called to check if the respective mailbox exists
        sinon.assert.calledOnce(createIfNotExistExportMailboxSpy);
        // underlying logic is fetching mailboxes
        sinon.assert.calledOnce(getMailboxesSpy);
        // create method is not called since mailbox already exists
        sinon.assert.notCalled(createMailboxSpy);
        chaiExpect(error).not.to.exist;
        chaiExpect(res).to.exist;
        chaiExpect(res.id).to.equal(exportRequestId);
      });

      it('should persist request in db and emit an event when payload is valid, mailbox for updates created', async () => {
        let res, error;
        const exportRequestId = '6fa3cda4-3d55-44be-abd0-60e81c2bc6d3';
        const context = mockUtil.makeContext();
        const createIfNotExistExportMailboxSpy = sinon.spy(
          serviceContext.bll.mailbox,
          'createMailboxIfNotExists'
        );
        const getMailboxesSpy = sinon.spy(
          serviceContext.dal.mailbox,
          'getMailboxes'
        );
        const createMailboxSpy = sinon.spy(
          serviceContext.dal.mailbox,
          'createMailbox'
        );
        // read when checking if renamed
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        // read when retrieving orgs
        serviceContext.dbConnections['media_platform'].read._push(
          [{ id: 2 }],
          false
        );
        // check if there's an existing request with the same filters
        serviceContext.dbConnections['core'].read._push([], false);
        // export status mailbox does not exist
        serviceContext.dbConnections['core'].read._push([], false);
        // getting application id for the mailbox
        serviceContext.dbConnections['sso'].read._push(
          [{ applicationId: 'xyz' }],
          false
        );
        // new mailbox is created
        serviceContext.dbConnections['core'].write._push([{ id: '1' }], false);
        // write request into db
        serviceContext.dbConnections['core'].write._push(
          [
            {
              id: exportRequestId,
              filters: {
                dateTimeFilter: {
                  fromDateTime: 1730748585000,
                  toDateTime: 1733340585000
                }
              }
            }
          ],
          false
        );
        await dal
          .createAuditLogExportRequest(context, {
            dateTimeFilter: {
              fromDateTime: '2024-11-04T19:29:45.847Z',
              toDateTime: '2024-12-04T19:29:45.847Z'
            },
            organizationId: '2'
          })
          .then((response) => {
            res = response;
          })
          .catch((err) => {
            error = err;
          });
        // method called to check if the respective mailbox exists
        sinon.assert.calledOnce(createIfNotExistExportMailboxSpy);
        // underlying logic is fetching mailboxes
        sinon.assert.calledOnce(getMailboxesSpy);
        // create method is called to create a new mailbox
        sinon.assert.calledOnce(createMailboxSpy);
        chaiExpect(error).not.to.exist;
        chaiExpect(res).to.exist;
        chaiExpect(res.id).to.equal(exportRequestId);
        // events and public topics
        chaiExpect(serviceContext.messageUtil._counter()).to.equal(2);
        const auditMessage = serviceContext.messageUtil._messages()[1];
        chaiExpect(auditMessage.auditLogExportRequestId).to.exist;
        chaiExpect(auditMessage.requestorId).to.equal(
          '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        );
        chaiExpect(auditMessage.filters.dateTimeFilter.fromDateTime).to.equal(
          '2024-11-04T19:29:45.847Z'
        );
        chaiExpect(auditMessage.filters.dateTimeFilter.toDateTime).to.equal(
          '2024-12-04T19:29:45.847Z'
        );
        chaiExpect(auditMessage.filters.organizationId).to.equal('2');
        chaiExpect(auditMessage.actionInfo.actionName).to.equal('create');
        chaiExpect(auditMessage.actionInfo.actionResult).to.equal('success');
        chaiExpect(auditMessage.actionInfo.actionDetails).to.equal(
          `Created an audit log export ${exportRequestId}`
        );
        chaiExpect(auditMessage.actionInfo.targetId).to.equal(
          auditMessage.auditLogExportRequestId
        );
        chaiExpect(auditMessage.actionInfo.targetType).to.equal(15);
        chaiExpect(auditMessage.actionInfo.error).to.equal(null);
      });
    });

    describe('#cancelAuditLogExportRequest', () => {
      it('should return error when id is not provided', async () => {
        let error;
        const context = mockUtil.makeContext();
        await dal.cancelAuditLogExportRequest(context, {}).catch((err) => {
          error = err;
        });
        chaiExpect(error).to.exist;
        chaiExpect(error.message).to.equal('The id is a required field.');
      });
      it('should return false when request is not found', async () => {
        let res, error;
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['core'].write._push([], false);
        const exportRequestId = '6fa3cda4-3d55-44be-abd0-60e81c2bc6d1';
        await dal
          .cancelAuditLogExportRequest(context, { id: exportRequestId })
          .then((response) => {
            res = response;
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).not.to.exist;
        chaiExpect(res).to.exist;
        chaiExpect(res).to.equal(false);
        chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
      });
      it('should return true when request is successfully cancelled', async () => {
        let res, error;
        const context = mockUtil.makeContext();
        serviceContext.dbConnections['core'].write._push([{ id: '1' }], false);
        const exportRequestId = '6fa3cda4-3d55-44be-abd0-60e81c2bc6d1';
        await dal
          .cancelAuditLogExportRequest(context, { id: exportRequestId })
          .then((response) => {
            res = response;
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).not.to.exist;
        chaiExpect(res).to.exist;
        chaiExpect(res).to.equal(true);
        // public topic
        chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
        const auditMessage = serviceContext.messageUtil._messages()[0];
        chaiExpect(auditMessage.auditLogExportRequestId).to.exist;
        chaiExpect(auditMessage.requestorId).to.equal(
          '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        );
        chaiExpect(auditMessage.createdDateTime).to.exist;
        chaiExpect(auditMessage.actionInfo.actionName).to.equal('update');
        chaiExpect(auditMessage.actionInfo.actionResult).to.equal('success');
        chaiExpect(auditMessage.actionInfo.actionDetails).to.equal(
          `Cancelled the audit log export ${exportRequestId}`
        );
        chaiExpect(auditMessage.actionInfo.targetId).to.equal(
          auditMessage.auditLogExportRequestId
        );
        chaiExpect(auditMessage.actionInfo.targetType).to.equal(15);
        chaiExpect(auditMessage.actionInfo.error).to.equal(null);
      });
    });
    describe('#getAuditLogExportRequestObjectsForOrg', () => {
      const orgExportRequest = {
        id: '1',
        filters: {
          dateTimeFilter: {
            fromDateTime: 1730748585000,
            toDateTime: 1733340585000
          }
        }
      };
      it('should use default pagination params if none passed in', async () => {
        const context = mockUtil.makeContext();
        const orgId = '2';
        let res, error;
        // read when checking if renamed
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        // read when retrieving orgs
        serviceContext.dbConnections['media_platform'].read._push(
          [{ id: orgId }],
          false
        );
        serviceContext.dbConnections['core'].read._push(
          [orgExportRequest],
          false
        );
        const dbReadSpy = sinon.spy(
          serviceContext.dbConnections['core'].read,
          'map'
        );

        await dal
          .getAuditLogExportRequestObjectsForOrg(context, {
            organizationId: orgId
          })
          .then((response) => {
            res = response;
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).not.to.exist;
        chaiExpect(res).to.exist;
        sinon.assert.calledOnce(dbReadSpy);
        sinon.assert.calledWith(
          dbReadSpy,
          sinon.match.any,
          [orgId, 30, 0],
          sinon.match.any
        );
        // events and public topics
        chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
        const event = serviceContext.messageUtil._messages()[0];
        chaiExpect(event.requestorId).to.equal(
          '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        );
        chaiExpect(event.actionInfo.actionName).to.equal('read');
        chaiExpect(event.actionInfo.actionResult).to.equal('success');
        chaiExpect(event.actionInfo.actionDetails).to.equal(
          `Requested a list of audit log exports for organization 2`
        );
        chaiExpect(event.actionInfo.targetId).to.equal('2');
        chaiExpect(event.actionInfo.targetType).to.equal(15);
        chaiExpect(event.actionInfo.error).to.equal(null);
      });

      it('should NOT use default pagination params when internalUse flag is true', async () => {
        const context = mockUtil.makeContext();
        const orgId = '2';
        let res, error;
        // read when checking if renamed
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        // read when retrieving orgs
        serviceContext.dbConnections['media_platform'].read._push(
          [{ id: orgId }],
          false
        );
        serviceContext.dbConnections['core'].read._push(
          [orgExportRequest],
          false
        );
        const dbReadSpy = sinon.spy(
          serviceContext.dbConnections['core'].read,
          'map'
        );

        await dal
          .getAuditLogExportRequestObjectsForOrg(
            context,
            {
              organizationId: orgId
            },
            false,
            true
          )
          .then((response) => {
            res = response;
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).not.to.exist;
        chaiExpect(res).to.exist;
        sinon.assert.calledOnce(dbReadSpy);
        sinon.assert.calledWith(
          dbReadSpy,
          sinon.match.any,
          [orgId], // no pagination params
          sinon.match.any
        );
        // events and public topics
        chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
        const event = serviceContext.messageUtil._messages()[0];
        chaiExpect(event.requestorId).to.equal(
          '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        );
        chaiExpect(event.actionInfo.actionName).to.equal('read');
        chaiExpect(event.actionInfo.actionResult).to.equal('success');
        chaiExpect(event.actionInfo.actionDetails).to.equal(
          `Requested a list of audit log exports for organization 2`
        );
        chaiExpect(event.actionInfo.targetId).to.equal('2');
        chaiExpect(event.actionInfo.targetType).to.equal(15);
        chaiExpect(event.actionInfo.error).to.equal(null);
      });

      it('should assign orgId from the authContext if none is passed in', async () => {
        const context = mockUtil.makeContext();
        const orgId = '2';
        const offset = 1;
        const limit = 10;
        context._authInfo = {
          userName: 'nobody+superadmin@veritone.com',
          organization: {
            organizationId: orgId
          }
        };
        let res, error;
        serviceContext.dbConnections['core'].read._push(
          [orgExportRequest],
          false
        );
        const dbReadSpy = sinon.spy(
          serviceContext.dbConnections['core'].read,
          'map'
        );
        await dal
          .getAuditLogExportRequestObjectsForOrg(context, {
            limit,
            offset
          })
          .then((response) => {
            res = response;
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).not.to.exist;
        chaiExpect(res).to.exist;
        sinon.assert.calledOnce(dbReadSpy);
        sinon.assert.calledWith(
          dbReadSpy,
          sinon.match((string) =>
            string.includes(`WHERE filters->>'organizationId'`)
          ),
          [orgId, limit, offset],
          sinon.match.any
        );
        // events and public topics
        chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
        const event = serviceContext.messageUtil._messages()[0];
        chaiExpect(event.requestorId).to.equal('apikey-2');
        chaiExpect(event.actionInfo.actionName).to.equal('read');
        chaiExpect(event.actionInfo.actionResult).to.equal('success');
        chaiExpect(event.actionInfo.actionDetails).to.equal(
          `Requested a list of audit log exports for organization ${orgId}`
        );
        chaiExpect(event.actionInfo.targetId).to.equal('2');
        chaiExpect(event.actionInfo.targetType).to.equal(15);
        chaiExpect(event.actionInfo.error).to.equal(null);
      });

      it('should query by filters passed in', async () => {
        const context = mockUtil.makeContext();
        const orgId = '2';
        const offset = 1;
        const limit = 10;
        let res, error;
        // read when checking if renamed
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        // read when retrieving orgs
        serviceContext.dbConnections['media_platform'].read._push(
          [{ id: orgId }],
          false
        );
        serviceContext.dbConnections['core'].read._push(
          [orgExportRequest],
          false
        );
        const dbReadSpy = sinon.spy(
          serviceContext.dbConnections['core'].read,
          'map'
        );
        await dal
          .getAuditLogExportRequestObjectsForOrg(context, {
            id: orgExportRequest.id,
            statuses: ['PENDING'],
            organizationId: orgId
          })
          .then((response) => {
            res = response;
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).not.to.exist;
        chaiExpect(res).to.exist;
        sinon.assert.calledOnce(dbReadSpy);
        sinon.assert.calledWith(
          dbReadSpy,
          sinon.match(
            (string) =>
              string.includes(`WHERE filters->>'organizationId'`) &&
              string.includes(`AND status = ANY($`) &&
              string.includes(`AND id = $`)
          ),
          [orgId, orgExportRequest.id, ['pending'], 30, 0],
          sinon.match.any
        );
        // events and public topics
        chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
        const event = serviceContext.messageUtil._messages()[0];
        chaiExpect(event.requestorId).to.equal(
          '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        );
        chaiExpect(event.actionInfo.actionName).to.equal('read');
        chaiExpect(event.actionInfo.actionResult).to.equal('success');
        chaiExpect(event.actionInfo.actionDetails).to.equal(
          `Requested the audit log export ${orgExportRequest.id}`
        );
        chaiExpect(event.actionInfo.targetId).to.equal('1');
        chaiExpect(event.actionInfo.targetType).to.equal(15);
        chaiExpect(event.actionInfo.error).to.equal(null);
      });

      it('should query by filters passed in withOut input id', async () => {
        const context = mockUtil.makeContext();
        const orgId = '2';
        const offset = 1;
        const limit = 10;
        let res, error;
        // read when checking if renamed
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        // read when retrieving orgs
        serviceContext.dbConnections['media_platform'].read._push(
          [{ id: orgId }],
          false
        );
        serviceContext.dbConnections['core'].read._push(
          [orgExportRequest],
          false
        );
        const dbReadSpy = sinon.spy(
          serviceContext.dbConnections['core'].read,
          'map'
        );
        await dal
          .getAuditLogExportRequestObjectsForOrg(context, {
            statuses: ['PENDING', 'CANCELLED'],
            organizationId: orgId
          })
          .then((response) => {
            res = response;
          })
          .catch((err) => {
            error = err;
          });
        chaiExpect(error).not.to.exist;
        chaiExpect(res).to.exist;
        sinon.assert.calledOnce(dbReadSpy);
        sinon.assert.calledWith(
          dbReadSpy,
          sinon.match(
            (string) =>
              string.includes(`WHERE filters->>'organizationId'`) &&
              string.includes(`AND status = ANY($`)
          ),
          [orgId, ['pending', 'cancelled'], 30, 0],
          sinon.match.any
        );
        // events and public topics
        chaiExpect(serviceContext.messageUtil._counter()).to.equal(1);
        const event = serviceContext.messageUtil._messages()[0];
        chaiExpect(event.requestorId).to.equal(
          '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        );
        chaiExpect(event.actionInfo.actionName).to.equal('read');
        chaiExpect(event.actionInfo.actionResult).to.equal('success');
        chaiExpect(event.actionInfo.actionDetails).to.equal(
          `Requested a list of audit log exports for organization ${orgId}`
        );
        chaiExpect(event.actionInfo.targetId).to.equal('2');
        chaiExpect(event.actionInfo.targetType).to.equal(15);
        chaiExpect(event.actionInfo.error).to.equal(null);
      });
    });
  });
});
