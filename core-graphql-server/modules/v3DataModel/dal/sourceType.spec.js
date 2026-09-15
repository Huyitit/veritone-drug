const chaiExpect = require('chai').expect;
const _ = require('lodash');
const moment = require('moment');
const httpMock = require('node-mocks-http');
const mockUtil = require('../../../test/mockUtil.js')();

const serviceContext = require('../test/serviceContext.mock.js')();
const dal = require('./sourceType.js')(serviceContext);
const contextUser = mockUtil.makeContext();

describe('sourceType.js', function () {
  beforeEach(function () {
    serviceContext._clearAll();
  });

  describe('#require', function () {
    it('should load module', function () {
      // load the module and validate basic structure
      chaiExpect(dal).to.be.a('object');
      chaiExpect(Object.keys(dal).length).to.equal(11);
    });
  });

  describe('#getSourceType', function () {
    it('should throw error not_found, if source type not found', async function () {
      let res, err;
      const args = { id: 'c1e8223a-9782-4b7e-accd-dc4cabee6547' };

      serviceContext.dbConnections['media_platform'].read._push([]);

      try {
        res = await dal.getSourceType(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
      chaiExpect(res).to.be.undefined;
    });

    it('should get sourceType by sourceTypeId', async function () {
      let res, err;
      const args = { id: '3b22de38-c711-4d33-85a9-042730161d8c' };

      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '3b22de38-c711-4d33-85a9-042730161d8c',
          name: 'sourceName',
          source_schema_id: 'sourceSchemaId',
          organization_id: 7682
        }
      ]);

      try {
        res = await dal.getSourceType(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res.id).to.equal('3b22de38-c711-4d33-85a9-042730161d8c');
      chaiExpect(res.name).to.equal('sourceName');
      chaiExpect(res.sourceSchemaId).to.equal('sourceSchemaId');
      chaiExpect(res.organizationId).to.equal(7682);
    });
  });

  describe('#getSourceTypes', function () {
    it('should get list source types, with full filters', async function () {
      let res, err;
      const args = {
        id: '5f848e9c-9116-4be3-903c-4577cd185ba4',
        ids: [
          '2f4c17ce-4d08-46e5-9b29-235264967ac9',
          '647bc64b-c1a8-44f2-a2ac-391e996b117c'
        ],
        categoryId: 'categoryId',
        isLive: true,
        offset: 0,
        limit: 30
      };

      serviceContext.dbConnections['media_platform'].read._push([
        { id: '5f848e9c-9116-4be3-903c-4577cd185ba4' },
        { id: '2f4c17ce-4d08-46e5-9b29-235264967ac9' },
        { id: '647bc64b-c1a8-44f2-a2ac-391e996b117c' }
      ]);

      try {
        res = await dal.getSourceTypes(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.offset).to.equal(0);
      chaiExpect(res.limit).to.equal(30);
      chaiExpect(res.count).to.equal(3);
      chaiExpect(res.records[0].id).to.equal(
        '5f848e9c-9116-4be3-903c-4577cd185ba4'
      );
      chaiExpect(res.records[1].id).to.equal(
        '2f4c17ce-4d08-46e5-9b29-235264967ac9'
      );
      chaiExpect(res.records[2].id).to.equal(
        '647bc64b-c1a8-44f2-a2ac-391e996b117c'
      );
    });

    it('should get list source types', async function () {
      let res, err;
      const args = {
        isLive: false
      };

      serviceContext.dbConnections['media_platform'].read._push([
        { id: '5f848e9c-9116-4be3-903c-4577cd185ba4' },
        { id: '2f4c17ce-4d08-46e5-9b29-235264967ac9' }
      ]);

      try {
        res = await dal.getSourceTypes(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records[0].id).to.equal(
        '5f848e9c-9116-4be3-903c-4577cd185ba4'
      );
      chaiExpect(res.records[1].id).to.equal(
        '2f4c17ce-4d08-46e5-9b29-235264967ac9'
      );
    });

    it('should get list source types, with empty where clause', async function () {
      let res, err;
      const args = {};

      serviceContext.dbConnections['media_platform'].read._push([
        { id: '5f848e9c-9116-4be3-903c-4577cd185ba4' },
        { id: '2f4c17ce-4d08-46e5-9b29-235264967ac9' }
      ]);

      try {
        res = await dal.getSourceTypes(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records[0].id).to.equal(
        '5f848e9c-9116-4be3-903c-4577cd185ba4'
      );
      chaiExpect(res.records[1].id).to.equal(
        '2f4c17ce-4d08-46e5-9b29-235264967ac9'
      );
    });
  });

  describe('#createSourceType', function () {
    it('should create source type', async function () {
      let res, err;
      const args = {
        input: {
          isPublic: true,
          organizationId: 7682,
          name: 'Podcast',
          sourceSchemaId: 'f6b8d24f-be0f-4cfc-8afa-ad8eb9e3a56b',
          isLive: true,
          requiresScanPipeline: true,
          credentialType: 'None',
          categoryId: 4
        }
      };

      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 4,
          name: 'Podcast',
          modified_date_time: '2018-09-25 16:45:04',
          created_date_time: '2018-04-26 19:18:51',
          source_schema_id: 'f6b8d24f-be0f-4cfc-8afa-ad8eb9e3a56b',
          credential_type: 'None',
          organization_id: 7682,
          is_live: true,
          requires_scan_pipeline: true,
          is_public: true,
          category_id: 4,
          icon_class: null
        }
      ]);

      try {
        res = await dal.createSourceType(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(4);
      chaiExpect(res.name).to.equal('Podcast');
      chaiExpect(res.sourceSchemaId).to.equal(
        'f6b8d24f-be0f-4cfc-8afa-ad8eb9e3a56b'
      );
      chaiExpect(res.credentialType).to.equal('None');
      chaiExpect(res.organizationId).to.equal(7682);
      chaiExpect(res.isLive).to.equal(true);
      chaiExpect(res.requiresScanPipeline).to.equal(true);
      chaiExpect(res.isPublic).to.equal(true);
      chaiExpect(res.categoryId).to.equal(4);
    });
  });

  describe('#updateSourceType', function () {
    it('should update source type by sourceTypeId', async function () {
      let res, err;
      const curDateTime = moment().toISOString();
      const args = {
        input: {
          id: 4,
          organizationId: 7682,
          isPublic: true,
          name: 'NAS',
          sourceSchemaId: '4f51d683-ce58-4cdd-b54b-da0f87d81a71',
          isLive: true,
          requiresScanPipeline: true,
          credentialType: 'None',
          categoryId: 1
        }
      };

      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 4,
          name: 'Podcast',
          modified_date_time: '2018-09-25 16:45:04',
          created_date_time: '2018-04-26 19:18:51',
          source_schema_id: 'f6b8d24f-be0f-4cfc-8afa-ad8eb9e3a56b',
          credential_type: 'None',
          organization_id: 7682,
          is_live: true,
          requires_scan_pipeline: true,
          is_public: true,
          category_id: 4,
          icon_class: null
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: 4,
          name: 'NAS',
          modified_date_time: curDateTime,
          created_date_time: '2018-04-26 19:18:51',
          source_schema_id: '4f51d683-ce58-4cdd-b54b-da0f87d81a71',
          credential_type: 'None',
          organization_id: 7682,
          is_live: true,
          requires_scan_pipeline: true,
          is_public: true,
          category_id: 1,
          icon_class: null
        }
      ]);

      try {
        res = await dal.updateSourceType(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(4);
      chaiExpect(res.name).to.equal('NAS');
      chaiExpect(res.sourceSchemaId).to.equal(
        '4f51d683-ce58-4cdd-b54b-da0f87d81a71'
      );
      chaiExpect(res.credentialType).to.equal('None');
      chaiExpect(res.organizationId).to.equal(7682);
      chaiExpect(res.isLive).to.equal(true);
      chaiExpect(res.requiresScanPipeline).to.equal(true);
      chaiExpect(res.isPublic).to.equal(true);
      chaiExpect(res.categoryId).to.equal(1);
      chaiExpect(res.modifiedDateTime).to.equal(curDateTime);
    });

    it('should return back the source type, if no data was modified', async function () {
      let res, err;
      const args = {
        input: {
          id: 4,
          organizationId: 7682
        }
      };

      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 4,
          name: 'Podcast',
          modified_date_time: '2018-09-25 16:45:04',
          created_date_time: '2018-04-26 19:18:51',
          source_schema_id: 'f6b8d24f-be0f-4cfc-8afa-ad8eb9e3a56b',
          credential_type: 'None',
          organization_id: 7682,
          is_live: true,
          requires_scan_pipeline: true,
          is_public: true,
          category_id: 4,
          icon_class: null
        }
      ]);

      try {
        res = await dal.updateSourceType(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(4);
      chaiExpect(res.name).to.equal('Podcast');
      chaiExpect(res.sourceSchemaId).to.equal(
        'f6b8d24f-be0f-4cfc-8afa-ad8eb9e3a56b'
      );
      chaiExpect(res.credentialType).to.equal('None');
      chaiExpect(res.organizationId).to.equal(7682);
      chaiExpect(res.isLive).to.equal(true);
      chaiExpect(res.requiresScanPipeline).to.equal(true);
      chaiExpect(res.isPublic).to.equal(true);
      chaiExpect(res.categoryId).to.equal(4);
    });
  });

  describe('#deleteSourceType', function () {
    it('should delete source type by sourceTypeId', async function () {
      let res, err;
      const args = { id: 4, organizationId: 7682 };

      serviceContext.dbConnections['media_platform'].write._push([
        { media_source_type_id: 4 }
      ]);

      try {
        res = await dal.deleteSourceType(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(4);
      chaiExpect(res.message).to.equal('SourceType deleted');
    });

    it('should throw error not_found, if sourceTypeId not found', async function () {
      let res, err;
      const args = { id: 4, organizationId: 7682 };

      serviceContext.dbConnections['media_platform'].write._push([]);

      try {
        res = await dal.deleteSourceType(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
      chaiExpect(res).to.be.undefined;
    });
  });

  describe('#getCombinedSourceTypeIds', function () {
    it('should get combine sourceTypeIds from a watchlist object, by sourceTypeIds', async function () {
      let res, err;
      const dalSource = serviceContext.dal.source;
      const dalSchedule = serviceContext.dal.scheduledJob;
      const object = {
        sourceTypeIds: [21, 4],
        sourceTypeId: 1,
        organizationId: 7682,
        id: 10010 //watchlistId
      };

      // mock data for dalSchedule.getSchedulesForWatchlist
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 153558,
          start_date_time: moment('2016-11-13').toISOString(),
          end_date_time: moment('2016-11-13').toISOString(),
          program_id: 23984,
          source_id: 39042,
          status_id: 1,
          status: 'Approved'
        },
        {
          id: 69285,
          start_date_time: moment('2015-08-01').toISOString(),
          end_date_time: moment('2026-01-29').toISOString(),
          program_id: 5600,
          source_id: 23882,
          status_id: 1,
          status: 'Approved'
        }
      ]);
      // mock data for dalSource.getSourcesForSchedule
      serviceContext.dbConnections['core'].read._push([
        { id: '39042' },
        { id: '23882' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { id: '39042' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 39042,
          name: 'KSPN-AM - LA RAMS',
          source_type_id: 21,
          organization_id: 7682,
          created_date_time: moment('2016-09-09 21:32:41').toISOString(),
          modified_date_time: moment('2018-10-01 18:39:09').toISOString()
        },
        {
          id: 23882,
          name: '102.5 KZOK Channel',
          source_type_id: 4,
          organization_id: 7682,
          created_date_time: moment('2015-10-29 00:23:21').toISOString(),
          modified_date_time: moment('2018-10-01 18:39:09').toISOString()
        }
      ]);

      try {
        res = await dal.getCombinedSourceTypeIds(
          contextUser,
          dalSource,
          dalSchedule,
          object
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(3);
      chaiExpect(_.includes(res, 21)).to.equal(true);
      chaiExpect(_.includes(res, 4)).to.equal(true);
      chaiExpect(_.includes(res, 1)).to.equal(true);
    });

    it('should get combine sourceTypeIds from a watchlist object', async function () {
      let res, err;
      const dalSource = serviceContext.dal.source;
      const dalSchedule = serviceContext.dal.scheduledJob;
      const object = {
        organizationId: 7682,
        id: 10010 //watchlistId
      };

      // mock data for dalSchedule.getSchedulesForWatchlist
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 153558,
          start_date_time: moment('2016-11-13').toISOString(),
          end_date_time: moment('2016-11-13').toISOString(),
          program_id: 23984,
          source_id: 39042,
          status_id: 1,
          status: 'Approved'
        },
        {
          id: 69285,
          start_date_time: moment('2015-08-01').toISOString(),
          end_date_time: moment('2026-01-29').toISOString(),
          program_id: 5600,
          source_id: 23882,
          status_id: 1,
          status: 'Approved'
        }
      ]);
      // mock data for dalSource.getSourcesForSchedule
      serviceContext.dbConnections['core'].read._push([
        { id: '39042' },
        { id: '23882' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { id: '39042' }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 39042,
          name: 'KSPN-AM - LA RAMS',
          source_type_id: 21,
          organization_id: 7682,
          created_date_time: moment('2016-09-09 21:32:41').toISOString(),
          modified_date_time: moment('2018-10-01 18:39:09').toISOString()
        },
        {
          id: 23882,
          name: '102.5 KZOK Channel',
          source_type_id: 4,
          organization_id: 7682,
          created_date_time: moment('2015-10-29 00:23:21').toISOString(),
          modified_date_time: moment('2018-10-01 18:39:09').toISOString()
        }
      ]);

      try {
        res = await dal.getCombinedSourceTypeIds(
          contextUser,
          dalSource,
          dalSchedule,
          object
        );
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(2);
      chaiExpect(_.includes(res, 21)).to.equal(true);
      chaiExpect(_.includes(res, 4)).to.equal(true);
    });
  });

  describe('#getSupportedRunModes', function () {
    it('should get list supported run modes, with isLive is true', async function () {
      let res, err;
      const sourceType = { isLive: true, requiresScanPipeline: true };

      try {
        res = await dal.getSupportedRunModes(sourceType);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(3);
      chaiExpect(_.includes(res, 'Once')).to.equal(true);
      chaiExpect(_.includes(res, 'Recurring')).to.equal(true);
      chaiExpect(_.includes(res, 'Continuous')).to.equal(true);
    });

    it('should get support run mode "Once", with sourceTypeId is 10', async function () {
      let res, err;
      const sourceType = { id: 10 };

      try {
        res = await dal.getSupportedRunModes(sourceType);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(1);
      chaiExpect(_.includes(res, 'Once')).to.equal(true);
    });

    it('should get list supported run modes, with isLive is false', async function () {
      let res, err;
      const sourceType = { isLive: false };

      try {
        res = await dal.getSupportedRunModes(sourceType);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(1);
      chaiExpect(_.includes(res, 'Now')).to.equal(true);
    });
  });

  describe('#getSourceTypeCategories', function () {
    it('should get source type categories, with given array IDs filter', async function () {
      let res, err;
      const args = { id: [1, 2] };

      try {
        res = await dal.getSourceTypeCategories(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(2);
      chaiExpect(res.records[0].id).to.equal(1);
      chaiExpect(res.records[1].id).to.equal(2);
    });

    it('should get source type categories, with given single ID filter', async function () {
      let res, err;
      const args = { id: 1 };

      try {
        res = await dal.getSourceTypeCategories(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(1);
      chaiExpect(res.records[0].id).to.equal(1);
    });

    it('should get source type categories', async function () {
      let res, err;
      const args = {};

      try {
        res = await dal.getSourceTypeCategories(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.count).to.equal(5);
      chaiExpect(res.records[0].id).to.equal(1);
      chaiExpect(res.records[1].id).to.equal(2);
      chaiExpect(res.records[2].id).to.equal(3);
      chaiExpect(res.records[3].id).to.equal(4);
      chaiExpect(res.records[4].id).to.equal(5);
    });
  });

  describe('#getSourceTypeCategory', function () {
    it('should get source type category by sourceTypeId', async function () {
      let res, err;
      const args = { id: 5 };

      try {
        res = await dal.getSourceTypeCategory(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.id).to.equal(5);
      chaiExpect(res.name).to.equal('General');
    });

    it('should throw error not_found, if the requested source type category does not exist', async function () {
      let res, err;
      const args = { id: 10 };

      try {
        res = await dal.getSourceTypeCategory(contextUser, args);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.exist;
      chaiExpect(err.name).to.equal('not_found');
      chaiExpect(res).to.be.undefined;
    });
  });

  describe('#getSourceTypeFormats', function () {
    it('should get source type formats by sourceTypeId', async function () {
      let res, err;
      const sourceType = { id: 1 };

      serviceContext.dbConnections['media_platform'].read._push([
        { name: 'Country' },
        { name: 'Urban' }
      ]);

      try {
        res = await dal.getSourceTypeFormats(contextUser, sourceType);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(2);
      chaiExpect(_.includes(res, 'Country')).to.equal(true);
      chaiExpect(_.includes(res, 'Urban')).to.equal(true);
    });
  });

  describe('#getSourceTypeProgramFormats', function () {
    it('should get source type program formats by sourceTypeId', async function () {
      let res, err;
      const sourceType = { id: 1 };

      serviceContext.dbConnections['media_platform'].read._push([
        { name: 'Adult Contemporary' },
        { name: 'New AC (NAC)/Smooth Jazz' }
      ]);

      try {
        res = await dal.getSourceTypeProgramFormats(contextUser, sourceType);
      } catch (error) {
        err = error ? JSON.parse(JSON.stringify(error, null, 2)) : undefined;
      }

      chaiExpect(err).to.be.undefined;
      chaiExpect(res).to.exist;
      chaiExpect(res.length).to.equal(2);
      chaiExpect(_.includes(res, 'Adult Contemporary')).to.equal(true);
      chaiExpect(_.includes(res, 'New AC (NAC)/Smooth Jazz')).to.equal(true);
    });
  });
});
