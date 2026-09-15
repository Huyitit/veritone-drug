const mockUtil = global.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();
let dal = require('./applicationViewer.js')(
  serviceContext,
  serviceContext.config
);

describe('applicationViewer.js', function () {
  describe('#require', function () {
    it('should load module', async function () {
      expect(typeof dal).toEqual('object');
      expect(typeof dal.getApplicationViewers).toEqual('function');
      expect(typeof dal.getApplicationViewerBuilds).toEqual('function');
      expect(typeof dal.createApplicationViewer).toEqual('function');
      expect(typeof dal.createApplicationViewerBuild).toEqual('function');
    });
  });

  describe('#getApplicationViewers', function () {
    it('should get application viewers', async function () {
      serviceContext.dbConnections['core'].read._push(
        [
          {
            viewerId: '83709857-ed1b-44c6-a5ad-001223fa1e1f',
            ownerOrganizationId: '7682',
            name: 'Test Fake Viewer 1',
            description: 'fake test description',
            icon: 'https://dev-api.veritone.amazonaws.com/test/123',
            mimeType: 'application/json',
            viewerType: 'external'
          }
        ],
        false
      );

      const res = await dal.getApplicationViewers(
        {
          ...mockUtil.makeContext()
        },
        {}
      );
      expect(res.records[0].id).toEqual('83709857-ed1b-44c6-a5ad-001223fa1e1f');
      expect(res.records[0].name).toEqual('Test Fake Viewer 1');
    });
  });

  describe('#_getApplicationViewersQuery', function () {
    it('query application viewers by ids', async function () {
      const context = mockUtil.makeContext();
      const options = {
        ids: [
          '83709857-ed1b-44c6-a5ad-001223fa1e1f',
          '93709857-ed1b-44c6-a5ad-001223fa1e1f'
        ]
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(
        `v.viewer_id = ANY($1::uuid[]) AND v.owner_organization_id = $2`
      );
      expect(args.length).toEqual(2);
    });

    it('query application viewers no options', async function () {
      const context = mockUtil.makeContext();
      const options = {};
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(args.length).toEqual(1);
      expect(sql).toContain(`v.owner_organization_id = $1`);
    });

    it('query application viewers orderBy field not present', async function () {
      const context = mockUtil.makeContext();
      const options = {
        orderBy: {
          direction: 'asc'
        }
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(args.length).toEqual(1);
      expect(sql).toContain(`v.owner_organization_id = $1`);
    });

    it('query application viewers orderBy name asc', async function () {
      const context = mockUtil.makeContext();
      const options = {
        orderBy: {
          field: 'name',
          direction: 'asc'
        }
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`ORDER BY v.name ASC`);
    });

    it('query application viewers orderBy name desc', async function () {
      const context = mockUtil.makeContext();
      const options = {
        orderBy: {
          field: 'name',
          direction: 'desc'
        }
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`ORDER BY v.name DESC`);
    });

    it('query application viewers orderBy id asc', async function () {
      const context = mockUtil.makeContext();
      const options = {
        orderBy: {
          field: 'id',
          direction: 'asc'
        }
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`ORDER BY v.viewer_id ASC`);
    });

    it('query application viewers orderBy id desc', async function () {
      const context = mockUtil.makeContext();
      const options = {
        orderBy: {
          field: 'id',
          direction: 'desc'
        }
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`ORDER BY v.viewer_id DESC`);
    });

    it('query application viewers orderBy date modified asc', async function () {
      const context = mockUtil.makeContext();
      const options = {
        orderBy: {
          field: 'modifiedDateTime',
          direction: 'asc'
        }
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`ORDER BY v.date_modified ASC`);
    });

    it('query application viewers orderBy date modified desc', async function () {
      const context = mockUtil.makeContext();
      const options = {
        orderBy: {
          field: 'modifiedDateTime',
          direction: 'desc'
        }
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`ORDER BY v.date_modified DESC`);
    });

    it('query application viewers orderBy date created desc', async function () {
      const context = mockUtil.makeContext();
      const options = {
        orderBy: {
          field: 'createdDateTime',
          direction: 'desc'
        }
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`ORDER BY v.date_created DESC`);
    });
    it('query application viewers orderBy date created asc', async function () {
      const context = mockUtil.makeContext();
      const options = {
        orderBy: {
          field: 'createdDateTime',
          direction: 'asc'
        }
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`ORDER BY v.date_created ASC`);
    });
    it('query application viewers with isPublic set to true', async function () {
      const context = mockUtil.makeContext();
      const options = {
        ids: [
          '83709857-ed1b-44c6-a5ad-001223fa1e1f',
          '93709857-ed1b-44c6-a5ad-001223fa1e1f'
        ],
        isPublic: true
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(
        `v.viewer_id = ANY($1::uuid[]) AND v.is_public = true`
      );
      expect(sql).not.toContain(`v.owner_organization_id = `);
      expect(args.length).toEqual(1);
    });
    it('query application viewers with isPublic set to false', async function () {
      const context = mockUtil.makeContext();
      const options = {
        ids: [
          '83709857-ed1b-44c6-a5ad-001223fa1e1f',
          '93709857-ed1b-44c6-a5ad-001223fa1e1f'
        ],
        isPublic: false
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(
        `v.viewer_id = ANY($1::uuid[]) AND v.owner_organization_id = $2 AND v.is_public = false`
      );
    });

    //offset and limit
    it('query application viewers with offset and limit', async function () {
      const context = mockUtil.makeContext();
      const options = {
        offset: 0,
        limit: 10
      };
      const { sql, args } = await dal._getApplicationViewersQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`v.owner_organization_id = $1 LIMIT $2 OFFSET $3`);
    });
  });

  describe('#getApplicationViewerBuilds', function () {
    it('should get application viewer build', async function () {
      const uuid = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      const uuid2 = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      serviceContext.dbConnections['core'].write._push(
        [
          {
            viewerBuildId: uuid,
            viewerId: uuid2,
            sourceUrl: 'https://www.fake.com',
            accessUrl: 'https://www.fake.com',
            status: 'deployed',
            version: 1
          }
        ],
        false
      );

      const res = await dal.getApplicationViewerBuilds(
        {
          ...mockUtil.makeContext()
        },
        {}
      );
      expect(res.records[0].id).toEqual('1c1de633-8745-403f-b6ea-5c77cb22a46d');
      expect(res.records[0].viewerId).toEqual(
        '83709857-ed1b-44c6-a5ad-001223fa1e1f'
      );
    });
  });

  describe('#_getApplicationViewerBuildsQuery', function () {
    it('query application viewerBuilds by viewerId', async function () {
      const context = mockUtil.makeContext();
      const options = {
        viewerIds: ['83709857-ed1b-44c6-a5ad-001223fa1e1f']
      };
      const { sql, args } = await dal._getApplicationViewerBuildsQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`vb.viewer_id = ANY($${args.length}::uuid[])`);
      expect(args.length).toEqual(1);
    });

    it('query application viewer builds by status', async function () {
      const context = mockUtil.makeContext();
      const options = {
        status: 'deployed'
      };
      const { sql, args } = await dal._getApplicationViewerBuildsQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`vb.status = $`);
      expect(args.length).toEqual(1);
      expect(args[0]).toEqual(options.status);
    });

    it('query application viewer builds orderBy version asc', async function () {
      const context = mockUtil.makeContext();
      const options = {
        orderBy: {
          field: 'version',
          direction: 'asc'
        }
      };
      const { sql, args } = await dal._getApplicationViewerBuildsQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`ORDER BY vb.version ASC`);
    });

    it('query application viewer builds orderBy version desc', async function () {
      const context = mockUtil.makeContext();
      const options = {
        orderBy: {
          field: 'version',
          direction: 'desc'
        }
      };
      const { sql, args } = await dal._getApplicationViewerBuildsQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`ORDER BY vb.version DESC`);
    });

    it('query application viewerBuilds with offset and limit', async function () {
      const context = mockUtil.makeContext();
      const options = {
        offset: 0,
        limit: 10
      };
      const { sql, args } = await dal._getApplicationViewerBuildsQuery(
        context,
        options
      );
      expect(sql).toBeDefined();
      expect(args).toBeDefined();
      expect(sql).toContain(`LIMIT $1 OFFSET $2`);
    });
  });

  describe('#createApplicationViewer', function () {
    it('should create application viewer', async function () {
      const viewerId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const viewer = {
        ownerOrganizationId: '7682',
        name: 'Test Fake Viewer 1',
        description: 'fake test description',
        icon: 'https://dev-api.veritone.amazonaws.com/test/123',
        mimeType: 'application/json',
        viewerType: 'external',
        isPublic: true
      };

      // createApplicationViewer query
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: viewerId,
            ...viewer,
            is_public: true
          }
        ],
        false
      );

      let res, err;

      try {
        res = await dal.createApplicationViewer(
          { input: viewer },
          {
            ...mockUtil.makeContext()
          }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res.id).toEqual(viewerId);
      expect(res.name).toEqual('Test Fake Viewer 1');
      expect(res.isPublic).toEqual(true);
    });
  });

  describe('#_createApplicationViewerQuery', function () {
    it('should create application viewer query', function () {
      const viewer = {
        ownerOrganizationId: '7682',
        name: 'Test Fake Viewer 1',
        description: 'fake test description',
        icon: 'https://dev-api.veritone.amazonaws.com/test/123',
        mimeType: 'application/json',
        viewerType: 'external'
      };

      let sql, values, err;

      try {
        const res = dal._createApplicationViewerQuery(viewer, {
          ...mockUtil.makeContext()
        });

        sql = res.sql;
        values = res.values;
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(sql).toBeDefined();
      expect(values).toBeDefined();
      expect(sql).toContain('INSERT INTO job_new.viewer');
      expect(values).toContain('Test Fake Viewer 1');
    });
  });

  describe('#createApplicationViewerBuild', function () {
    it('should create first application viewer build', async function () {
      const viewerBuildId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      const viewerBuild = {
        viewerId: '83709857-ed1b-44c6-a5ad-001223fa1e1f',
        sourceUrl: 'https://www.fake.com',
        accessUrl: 'https://www.fake.com/access',
        status: 'draft',
        version: 1
      };

      // getApplicationViewers query
      serviceContext.dbConnections['core'].write._push(
        [
          {
            viewerId: '83709857-ed1b-44c6-a5ad-001223fa1e1f',
            ownerOrganizationId: 7682
          }
        ],
        false
      );

      // getApplicationViewersBuild query - empty to show no other builds for this viewer
      serviceContext.dbConnections['core'].write._push([], false);

      // createApplicationViewerBuild query
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: viewerBuildId,
            ...viewerBuild
          }
        ],
        false
      );

      let res, err;

      try {
        res = await dal.createApplicationViewerBuild(
          { input: { ...viewerBuild, organizationId: 7682 } },
          {
            ...mockUtil.makeContext()
          }
        );
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(res.id).toEqual(viewerBuildId);
      expect(res.sourceUrl).toEqual('https://www.fake.com');
      expect(res.version).toEqual(1);
    });

    it('should not allow user to create build of a viewer not created by org', async function () {
      const viewerBuildId = '1c1de633-8745-403f-b6ea-5c77cb22a46d';
      const viewerBuild = {
        viewerId: '83709857-ed1b-44c6-a5ad-001223fa1e1f',
        sourceUrl: 'https://www.fake.com',
        accessUrl: 'https://www.fake.com/access',
        status: 'draft',
        version: 1
      };

      // getApplicationViewers query
      serviceContext.dbConnections['core'].write._push(
        [
          {
            viewerId: '83709857-ed1b-44c6-a5ad-001223fa1e1f',
            ownerOrganizationId: 7682
          }
        ],
        false
      );

      // getApplicationViewersBuild query - empty to show no other builds for this viewer
      serviceContext.dbConnections['core'].write._push([], false);

      // createApplicationViewerBuild query
      serviceContext.dbConnections['core'].write._push(
        [
          {
            id: viewerBuildId,
            ...viewerBuild
          }
        ],
        false
      );

      let res, err;

      try {
        res = await dal.createApplicationViewerBuild(
          { input: { ...viewerBuild, organizationId: 100 } },
          {
            ...mockUtil.makeContext()
          }
        );
      } catch (e) {
        err = e;
      }

      expect(res).toBeUndefined();
      expect(err).toBeDefined();
    });
  });

  describe('#_createApplicationViewerBuildQuery', function () {
    it('should create application viewer build query', function () {
      const viewerBuild = {
        viewerId: '83709857-ed1b-44c6-a5ad-001223fa1e1f',
        sourceUrl: 'https://www.fake.com',
        accessUrl: 'https://www.fake.com/access',
        status: 'draft'
      };

      let sql, values, err;

      try {
        const res = dal._createApplicationViewerBuildQuery(viewerBuild, {
          ...mockUtil.makeContext()
        });

        sql = res.sql;
        values = res.values;
      } catch (e) {
        err = e;
      }

      expect(err).toBeUndefined();
      expect(sql).toBeDefined();
      expect(values).toBeDefined();
      expect(sql).toContain('INSERT INTO job_new.viewer_build');
      expect(values).toContain('https://www.fake.com');
    });
  });

  describe('#updateApplicationViewer', function () {
    it('should update an application viewer', async function () {
      const viewerId = '4c901122-cee7-4320-bc90-16378ed43f4f';
      const viewerBuildId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      serviceContext.dbConnections['core'].read._push(
        [
          {
            viewerId: viewerId,
            name: 'Test Viewer',
            description: 'this is a test viewer',
            icon: 'https://aiware.com/_next/static/media/aiWARE.5ef49573.png',
            mimetype: 'application/json',
            viewerType: 'external',
            is_public: true
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            viewerBuildId: viewerBuildId,
            viewerId: viewerId,
            sourceUrl: 'https://www.fake.com',
            accessUrl: 'https://www.fake.com',
            status: 'deployed',
            version: 1,
            name: '',
            description: '',
            mimetype: '',
            viewerType: '',
            icon: '',
            dateCreated: '',
            dateModified: '',
            createdBy: ''
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].read._push(
        [
          {
            viewerId: viewerId,
            name: 'Test Viewer Updated',
            description: 'this is a updated test viewer',
            icon: 'https://aiware.com/_next/static/media/aiWARE.5ef49573.png',
            mimetype: 'application/json',
            viewerType: 'external',
            is_public: false
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            viewerBuildId: viewerBuildId,
            viewerId: viewerId,
            sourceUrl: 'https://www.fake.com',
            accessUrl: 'https://www.fake.com',
            status: 'deployed',
            version: 1
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            viewerBuildId: viewerBuildId,
            viewerId: viewerId,
            sourceUrl: 'https://www.fake.com',
            accessUrl: 'https://www.fake.com',
            status: 'deployed',
            version: 1
          }
        ],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [
          {
            viewerBuildId: viewerBuildId,
            viewerId: viewerId,
            sourceUrl: 'https://www.fake.com',
            accessUrl: 'https://www.fake.com',
            status: 'deployed',
            version: 1
          }
        ],
        false
      );

      const res = await dal.updateApplicationViewer(
        {
          viewerId: viewerId,
          input: {
            name: 'Test Viewer Updated',
            description: 'this is a updated test viewer',
            icon: 'https://aiware.com/_next/static/media/aiWARE.5ef49573.png',
            isPublic: false
          }
        },
        {
          ...mockUtil.makeContext()
        }
      );
      expect(res.name).toEqual('Test Viewer Updated');
      expect(res.description).toEqual('this is a updated test viewer');
      expect(res.viewerId).toEqual(viewerId);
      expect(res.isPublic).toEqual(false);
    });
  });

  describe('#deleteApplicationViewer', function () {
    it('should delete an application viewer', async function () {
      const viewerId = '4c901122-cee7-4320-bc90-16378ed43f4f';
      const mockViewer = {
        viewerId: viewerId,
        name: 'Test Viewer',
        description: 'this is a test viewer',
        icon: 'https://aiware.com/_next/static/media/aiWARE.5ef49573.png',
        mimetype: 'application/json',
        viewerType: 'external'
      };

      serviceContext.dbConnections['core'].write._push([mockViewer], false);

      serviceContext.dbConnections['core'].write._push([mockViewer], false);

      const res = await dal.deleteApplicationViewer(
        {
          viewerId: viewerId
        },
        {
          ...mockUtil.makeContext()
        }
      );
      expect(res.name).toEqual('Test Viewer');
      expect(res.description).toEqual('this is a test viewer');
      expect(res.viewerId).toEqual(viewerId);
    });
  });

  describe('#deleteApplicationViewerBuild', function () {
    it('should delete an application viewer build', async function () {
      const viewerId = '4c901122-cee7-4320-bc90-16378ed43f4f';
      const viewerBuildId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
      const mockViewerBuild = {
        viewerBuildId,
        viewerId,
        sourceUrl: 'https://aiware.com/_next/static/media/aiWARE.5ef49573.png',
        accessUrl: 'https://aiware.com/',
        version: 1,
        status: 'deployed'
      };

      serviceContext.dbConnections['core'].write._push(
        [mockViewerBuild],
        false
      );

      serviceContext.dbConnections['core'].write._push(
        [mockViewerBuild],
        false
      );

      const res = await dal.deleteApplicationViewerBuild(
        {
          viewerBuild: viewerId
        },
        {
          ...mockUtil.makeContext()
        }
      );
      expect(res.viewerBuildId).toEqual(viewerBuildId);
      expect(res.viewerId).toEqual(viewerId);
    });
  });
});
