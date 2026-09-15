const _ = require('lodash');
const mockUtil = globalThis.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(undefined, {
  enableTransactionQuery: true
});

_.set(serviceContext, 'config.featureFlags.enableRBACFeature', true);

serviceContext.dal.folderV2 = {
  createFolder: jest.fn((context, args) => {
    return Promise.resolve({});
  }),
  updateFolder: jest.fn((context, args) => {
    return Promise.resolve({});
  }),
  deleteFolder: jest.fn((context, tdoId, arg) => {
    return Promise.resolve({});
  }),
  getFolder: jest.fn((context, tdoId, arg) => {
    return Promise.resolve({});
  }),
  getRootFolders: jest.fn((context, tdoId, arg) => {
    return Promise.resolve({});
  }),
  getOrCreateRootFolders: jest.fn((context, tdoId, arg) => {
    return Promise.resolve({});
  }),
  getOrCreateOrgRootFolder: jest.fn((context, tdoId, arg) => {
    return Promise.resolve({});
  }),
  getOrCreateUserRootFolder: jest.fn((context, tdoId, arg) => {
    return Promise.resolve({});
  }),
  getOrCreateRootFolder: jest.fn((context, args) => {
    return Promise.resolve({});
  }),
  contentTemplateIdToFolderSdo: jest.fn((id) => {
    return Promise.resolve({});
  }),
  fileFolderItem: jest.fn(),
  unfileFolderItem: jest.fn(),
  shareFolder: jest.fn(),
  getSharedFolders: jest.fn()
};

serviceContext.dal.treeObject = {
  getTreeObject: jest.fn((context, tdoId, arg) => {
    if (tdoId == '00000000-0000-0000-0000-000000000000' && arg) {
      return Promise.resolve(null);
    } else {
      return Promise.resolve({
        parentObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195',
        parentTreeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195'
      });
    }
  }),
  getTreeObjectIds: jest.fn((ids) => {
    if (ids) {
      return Promise.resolve(
        ids.reduce((obj, id) => {
          return id === '00000000-0000-0000-0000-000000000000'
            ? obj
            : _.set(obj, id, '2ace46d4-9e27-4fea-9623-75231ff21195');
        }, {})
      );
    } else {
      return Promise.resolve({});
    }
  }),
  insertTreeObject: jest.fn((context, tdoId, arg) => {
    return Promise.resolve({});
  }),
  removeTreeObject: jest.fn((context, filed, arg) => {
    return Promise.resolve({});
  })
};
serviceContext.dal.tdo = {
  getTDO: jest.fn((context, args) => {
    if (args) {
      return Promise.resolve({
        id: args.id,
        applicationId: args.applicationId
      });
    } else {
      return Promise.resolve(null);
    }
  }),
  getTDOs: jest.fn((context, args) => {
    return Promise.resolve({
      count: 3,
      records: [{}, {}, {}]
    });
  }),
  updateFolderInSearchIndex: jest.fn(() => {
    return Promise.resolve();
  })
};
// serviceContext.dal.folderV2 = {
//   fileFolderItem: jest.fn(),
//   unfileFolderItem: jest.fn(),
//   shareFolder: jest.fn(),
//   getSharedFolders: jest.fn()
// };
serviceContext.dal.entityTags = {
  updateEntityTags: jest.fn(),
  getEntityIdsByTagKeys: jest.fn()
};

function expectFunction(obj, key) {
  expect(typeof obj[key]).toBe('function');
}

const dal = require('./dalFolder.js')(serviceContext);
describe('dalFolder.js', () => {
  beforeEach(() => {
    _.merge(serviceContext.bll, {
      rbacAuth: {
        getAuthGroups: jest.fn(),
        getAuthPermissionSets: jest.fn(),
        addACEsToResources: jest.fn(),
        addDefaultACEsToResources: jest.fn(),
        removeACEsFromResources: jest.fn(),
        hasPermissions: jest.fn()
      }
    });
    _.merge(serviceContext.dal, {
      organization: {
        getOrganization: jest.fn()
      }
    });
  });
  describe('#require', () => {
    it('should have correct function exports', () => {
      expect(typeof dal).toBe('object');
      expect(Object.keys(dal).length).toBe(57);
      expectFunction(dal, 'createFolder');
      expectFunction(dal, 'createFolderContentTemplate');
      expectFunction(dal, 'deleteFolder');
      expectFunction(dal, 'fileObject');
      expectFunction(dal, 'fileTDO');
      expectFunction(dal, 'getChildTDOs');
      expectFunction(dal, 'removeTDOFromFolders');
      expectFunction(dal, 'getFolder');
      expectFunction(dal, 'getFolderContentTemplates');
      expectFunction(dal, 'getOrCreateOrgRootFolder');
      expectFunction(dal, 'getOrCreateRootFolders');
      expectFunction(dal, 'getOrCreateUserRootFolder');
      expectFunction(dal, 'getParentFolder');
      expectFunction(dal, 'getParentTreeItem');
      expectFunction(dal, 'getSubfolders');
      expectFunction(dal, 'getFolderPath');
      expectFunction(dal, 'getSharedFolders');
      expectFunction(dal, 'moveFolder');
      expectFunction(dal, 'moveTDO');
      expectFunction(dal, 'moveWatchlist');
      expectFunction(dal, 'getRootFolders');
      expectFunction(dal, 'shareFolder');
      expectFunction(dal, 'unfileTDO');
      expectFunction(dal, 'updateFolder');
      expectFunction(dal, 'updateFolderContentTemplate');
      expectFunction(dal, 'deleteFolderContentTemplate');
      expectFunction(dal, 'getTreeObjectInfoForObject');
      expectFunction(dal, 'getChildWatchlists');
      expectFunction(dal, 'getFolderOverview');
      expectFunction(dal, 'getFolderSummaryDetails');
      expectFunction(dal, 'mapSubfoldersIntoParentFolders');
      expectFunction(dal, '_validateAccess');
      expectFunction(dal, 'unfileObject');
      expectFunction(dal, 'buildFolderStructure');
      expectFunction(dal, 'validateTreeObject');
      expectFunction(dal, 'getChildApplications');
      expectFunction(dal, 'unfileApplication');
      expectFunction(dal, 'emitFixupV2FolderRowsEvent');
      expectFunction(dal, 'getUserRootFolders');

      expect(typeof dal.TREE_OBJECT_TYPE).toBe('object');
      expect(typeof dal.ROOT_FOLDER_TYPE_NAME).toBe('object');
    });
  });

  describe('#createFolder', () => {
    it("should create folder in other organization is user is super admin", async () => {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.json.rights', ['superadmin']);
      _.set(context, '_authInfo.organization.organizationId', 7682); // Super Admin's org

      const parentOrgId = 52883; // Parent folder's org (different from Super Admin's)

      // Mock _getV1ParentIdFromV2 - no V2 folder
      serviceContext.dbConnections['media_platform'].read._push([], false, []);
      // getTreeObjectId lookup - parent folder
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        false
      );
      // _validateAccess query
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      // tree_object_type_id check
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_type_id: 1
          }
        ],
        false
      );
      // depth check
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      // _createFolder result
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_id: 'new-tree-object-id'
          }
        ],
        false
      );
      // _getFolder result
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_folder_name: "Cross Org Folder",
            tree_folder_description: "Created by superadmin in different org",
            id: "new-folder-id",
            type_id: 1,
            object_id: "new-folder-id",
            tree_object_id: "new-tree-object-id",
            order_index: 0,
            created_date_time: new Date(),
            modified_date_time: new Date(),
            tree_object_status: 1,
            shared_with: [],
          }
        ],
        false
      );
      // _getRootOrganizationIdForTreeObject - returns parent's root folder organization_id
      serviceContext.dbConnections["media_platform"].read._push(
        [{ organization_id: parentOrgId }],
        false
      );

      // Mock RBAC to verify correct organizationId is used
      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockImplementation(
        (ctx, args) => {
          // Verify the folder is created with parent's org, not Super Admin's org
          expect(args.organizationId).toBe(parentOrgId);
          expect(args.objectId).toBe('new-folder-id');
          expect(args.resourceType).toBe('Folder');
          return Promise.resolve({});
        }
      );

      const res = await dal.createFolder(context, {
        input: {
          name: "Cross Org Folder",
          description: "Created by superadmin in different org",
          parentId: "1ace46d4-9e27-4fea-9623-75231ff21195",
        },
        organizationId: 7682 // Super Admin's own org (should be overridden to parent's org)
      });

      expect(res).toBeDefined();
      expect(res.id).toBe("new-folder-id");
      expect(res.name).toBe("Cross Org Folder");
      // The folder should have the parent's organizationId, not the Super Admin's
      expect(res.organizationId).toBe(parentOrgId);

      // Verify event was emitted
      const messages = serviceContext.messageUtil._messages();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: "create",
          actionResult: "success",
        }),
      );
    });
    it('should throw error on invalid input parentId', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.createFolder(context, {
          input: {
            parentId: 'invalid_input'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'create',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should throw error on invalid folder name', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.createFolder(context, {
          input: {
            parentId: '1ace46d4-9e27-4fea-9623-75231ff21195',
            name: ''
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.message).toContain(`the name field is required.`);
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'create',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should throw error on invalid folder name 2', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.createFolder(context, {
          input: {
            parentId: '1ace46d4-9e27-4fea-9623-75231ff21195',
            name: '  '
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.message).toContain(`the name field is required.`);
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'create',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should throw error on invalid folder model', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.createFolder(context, {
          input: {
            parentId: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBeDefined();
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'create',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should throw error on invalid access', async () => {
      const context = mockUtil.makeContext();
      try {
        // Mock _getV1ParentIdFromV2
        serviceContext.dbConnections['media_platform'].read._push(
          [],
          false,
          []
        );

        serviceContext.dbConnections['media_platform'].read._push([], false);
        serviceContext.dbConnections['media_platform'].read._push([], false);
        await dal.createFolder(context, {
          input: {
            name: 'folder name',
            description: 'folder description',
            parentId: '1ace46d4-9e27-4fea-9623-75231ff21195'
          },
          organizationId: '1'
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'create',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should throw error on invalid access', async () => {
      const context = mockUtil.makeContext();
      try {
        // Mock _getV1ParentIdFromV2
        serviceContext.dbConnections['media_platform'].read._push(
          [],
          false,
          []
        );

        serviceContext.dbConnections['media_platform'].read._push([], false);
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        serviceContext.dbConnections['media_platform'].write._push([{}], false);
        await dal.createFolder(context, {
          input: {
            name: 'folder name',
            description: 'folder description',
            parentId: '00000000-0000-0000-0000-000000000000'
          },
          organizationId: '1'
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'create',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should throw error on maximum folder depth limitations.', async () => {
      const context = mockUtil.makeContext();
      try {
        // Mock _getV1ParentIdFromV2
        serviceContext.dbConnections['media_platform'].read._push(
          [],
          false,
          []
        );

        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              id: '1ace46d4-9e27-4fea-9623-75231ff21195'
            }
          ],
          false
        );
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              tree_object_type_id: 1
            }
          ],
          false
        );
        serviceContext.dbConnections['media_platform'].read._push([], false);
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        serviceContext.dbConnections['media_platform'].read._push([{}], false);
        await dal.createFolder(context, {
          input: {
            name: 'folder name',
            description: 'error',
            parentId: '1ace46d4-9e27-4fea-9623-75231ff21195'
          },
          organizationId: '1'
        });
        expect.fail('no throw');
      } catch (err) {
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'create',
            actionResult: 'failure'
          })
        );
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe(
          'Adding the new folder would exceed maximum folder depth limitations.'
        );
      }
    });
    it('should create folder', async () => {
      const context = mockUtil.makeContext();
      // Mock _getV1ParentIdFromV2 - no V2 folder
      serviceContext.dbConnections['media_platform'].read._push([], false, []);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_type_id: 1
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_id: 2
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      // Mock _getRootOrganizationIdForTreeObject for superadmin context
      serviceContext.dbConnections['media_platform'].read._push(
        [{ organization_id: 1 }],
        false
      );
      // getOrganization for RBAC
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return {
          id: '---orgId---'
        };
      });
      const res = await dal.createFolder(context, {
        input: {
          name: 'folder name',
          description: 'success',
          parentId: '1ace46d4-9e27-4fea-9623-75231ff21195'
        },
        organizationId: '1'
      });
      expect(res).toBeDefined();

      // event
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
    });
    it('should create folder and add ACEs', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([], false, []);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_type_id: 1
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_id: 2
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '---folderId---'
          }
        ],
        false
      );
      // Mock _getRootOrganizationIdForTreeObject for superadmin context
      serviceContext.dbConnections['media_platform'].read._push(
        [{ organization_id: 1 }],
        false
      );
      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockImplementation(
        (arg1, arg2) => {
          expect(arg2.organizationId).toBe(1);
          expect(arg2.objectId).toBe('---folderId---');
          expect(arg2.resourceType).toBe('Folder');
          return Promise.resolve();
        }
      );
      const res = await dal.createFolder(context, {
        input: {
          name: 'folder name',
          description: 'success',
          parentId: '1ace46d4-9e27-4fea-9623-75231ff21195'
        },
        organizationId: '1'
      });
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
      expect(res).toBeDefined();
    });
    it('should create folder and add entity tags', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([], false, []);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_type_id: 1
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_id: 2
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '---folderId---'
          }
        ],
        false
      );
      // Mock _getRootOrganizationIdForTreeObject for superadmin context
      serviceContext.dbConnections['media_platform'].read._push(
        [{ organization_id: 1 }],
        false
      );
      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockImplementation(
        (arg1, arg2) => {
          expect(arg2.organizationId).toBe(1);
          expect(arg2.objectId).toBe('---folderId---');
          expect(arg2.resourceType).toBe('Folder');
          return Promise.resolve();
        }
      );
      serviceContext.dal.entityTags.updateEntityTags.mockImplementation(
        (arg1, arg2) => {
          expect(arg1.organizationId).toBe(1);
          expect(arg1.entityId).toBe('---folderId---');
          expect(arg1.entityType).toEqual('folder');
          expect(arg1.entityTags).toMatchObject([
            { tagKey: 'tag_001', tagValue: 'tag_value_001' },
            { tagKey: 'tag_002', tagValue: 'tag_value_002' }
          ]);
          return Promise.resolve();
        }
      );
      const res = await dal.createFolder(context, {
        input: {
          name: 'folder name',
          description: 'success',
          parentId: '1ace46d4-9e27-4fea-9623-75231ff21195',
          entityTags: [
            { tagKey: 'tag_001', tagValue: 'tag_value_001' },
            { tagKey: 'tag_002', tagValue: 'tag_value_002' }
          ]
        },
        organizationId: '1'
      });
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'create',
          actionResult: 'success'
        })
      );
      expect(res).toBeDefined();
    });
  });
  describe('#createFolderContentTemplate', () => {
    it('should create a folder content template', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          sdo_id: '2ace46d4-0000-4fea-9623-75231ff21195',
          data_registry_id: '3ace46d4-9e27-4fea-9623-75231ff21195',
          creation_date: new Date(),
          last_updated_date: new Date()
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          sdo_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          data_registry_id: '3ace46d4-9e27-4fea-9623-75231ff21195',
          creation_date: new Date(),
          last_updated_date: new Date()
        }
      ]);
      await dal.createFolderContentTemplate(
        mockUtil.makeContext(),
        {
          input: {
            folderId: '1ace46d4-9e27-4fea-9623-75231ff21195',
            sdoId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            schemaId: '3ace46d4-9e27-4fea-9623-75231ff21195'
          }
        }
      );
    });
    it('should error on invalid input', async () => {
      try {
        await dal.createFolderContentTemplate(mockUtil.makeContext(), {
          input: {
            sdoId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            schemaId: '3ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should error on invalid input', async () => {
      try {
        await dal.createFolderContentTemplate(mockUtil.makeContext(), {});
        expect.fail('no throw');
      } catch (err) {
        if (err.name !== 'invalid_input')
          expect(err.name).toBe('invalid_input');
      }
    });
  });

  describe('#deleteFolder', () => {
    it('should throw error invalid input', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.deleteFolder(context, {
          input: {
            id: 'invalid_input',
            orderIndex: 1
          },
          organizationId: 7682
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('invalid_input');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'delete',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should delete folder - rbacAuth enabled', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_folder_name: 'folder1',
          tree_folder_description: 'folder 1',
          id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          type_id: 1,
          object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          order_index: 2,
          created_date_time: new Date(),
          modified_date_time: new Date(),
          tree_object_status: 1,
          shared_with: []
        }
      ]);

      serviceContext.dbConnections['media_platform'].write._push(
        [],
        false,
        [],
        (sql, params) => {
          // should be tree_object_id
          expect(params[0]).toEqual('2ace46d4-9e27-4fea-9623-75231ff21195');
          return true;
        }
      );
      // mock get root folder
      serviceContext.dbConnections['media_platform'].read._push([]);

      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 1000,
        kvp: {
          features: {
            enableRBACFeature: 'enabled'
          }
        }
      });
      serviceContext.bll.rbacAuth.removeACEsFromResources.mockReturnValue({});
      serviceContext.dal.entityTags.updateEntityTags.mockReturnValue({});
      serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValueOnce([
        {
          hasPermission: true
        }
      ]);

      const context = mockUtil.makeContext();
      const res = await dal.deleteFolder(context, {
        input: {
          id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          orderIndex: 1
        },
        organizationId: '7682'
      });

      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'delete',
          actionResult: 'success'
        })
      );

      expect(res).toBeDefined();
      expect(
        serviceContext.bll.rbacAuth.removeACEsFromResources.mock.calls.length
      ).toBe(1);
      expect(
        serviceContext.dal.entityTags.updateEntityTags
      ).toHaveBeenCalledWith(
        {
          entityId: '2ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: '7682',
          entityType: 'folder',
          entityTags: []
        },
        expect.any(Object),
        expect.any(Object)
      );
    });
    it('should delete folder - rbacAuth disabled', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_folder_name: 'folder1',
          tree_folder_description: 'folder 1',
          id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          type_id: 1,
          object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          order_index: 2,
          created_date_time: new Date(),
          modified_date_time: new Date(),
          tree_object_status: 1,
          shared_with: []
        }
      ]);

      serviceContext.dbConnections['media_platform'].write._push(
        [],
        false,
        [],
        (sql, params) => {
          // should be tree_object_id
          expect(params[0]).toEqual('2ace46d4-9e27-4fea-9623-75231ff21195');
          return true;
        }
      );
      // mock get root folder
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 1000,
        kvp: {
          features: {
            enableRBACFeature: 'disabled'
          }
        }
      });
      serviceContext.bll.rbacAuth.removeACEsFromResources.mockReturnValue({});
      serviceContext.dal.entityTags.updateEntityTags.mockReturnValue({});
      serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValueOnce([
        {
          hasPermission: true
        }
      ]);

      const context = mockUtil.makeContext();
      const res = await dal.deleteFolder(context, {
        input: {
          id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          orderIndex: 1
        },
        organizationId: '7682'
      });

      expect(res).toBeDefined();
      expect(
        serviceContext.bll.rbacAuth.removeACEsFromResources.mock.calls.length
      ).toBe(1);
      expect(
        serviceContext.dal.entityTags.updateEntityTags
      ).toHaveBeenCalledWith(
        {
          entityId: '2ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: '7682',
          entityType: 'folder',
          entityTags: []
        },
        expect.any(Object),
        expect.any(Object)
      );

      // event
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'delete',
          actionResult: 'success'
        })
      );
    });
    it('should not delete root folder', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_folder_name: 'folder1',
          tree_folder_description: 'folder 1',
          id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          type_id: 1,
          object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          order_index: 2,
          created_date_time: new Date(),
          modified_date_time: new Date(),
          tree_object_status: 1,
          shared_with: []
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([{
        id: 'root-folder-id',
        type_id: 4,
        organization_id: 7682,
        shares_to: []
      }]);

      const context = mockUtil.makeContext();
      try {
        await dal.deleteFolder(context, {
          input: {
            id: '2ace46d4-9e27-4fea-9623-75231ff21195',
            orderIndex: 1
          },
          organizationId: '7682'
        });
      } catch (error) {
        expect(error.message).toBe(
          'Can not delete root folder'
        );
        expect(error.name).toBe('not_allowed');
      }
    });
  });
  describe('#fileObject', () => {
    it('should throw error invalid input', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.fileObject(
          context,
          '7682',
          '2ace46d4-9e27-4fea-9623-75231ff21195',
          '2ace46d4-9e27-4fea-9623-75231ff21195'
        );
        expect.fail('no throw');
      } catch (err) {
        expect(err.message).toBe(
          'The object has already been filed elsewhere.'
        );
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should file object', async () => {
      mockForGetFolder();
      serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValueOnce([
        {
          hasPermission: true
        }
      ]);
      const context = mockUtil.makeContext();
      const res = await dal.fileObject(
        context,
        '7682',
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000000'
      );

      expect(res).toBeDefined();
    });
  });
  describe('#fileTDO', () => {
    it('should throw error invalid input', async () => {
      mockForGetFolder();
      const context = mockUtil.makeContext();
      try {
        await dal.fileTDO(context, {
          input: {
            orderIndex: 0,
            tdoId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            folderId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: '7682'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.message).toBe('TDO has already been filed elsewhere.');
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should complete fileTDO', async () => {
      serviceContext.dal.tdo.updateFolderInSearchIndex.mockClear();
      mockForGetFolder();
      serviceContext.dbConnections['sso'].read._push([
        {
          organization_id: 7682
        }
      ]);
      const context = mockUtil.makeContext();
      const res = await dal.fileTDO(context, {
        input: {
          orderIndex: 0,
          tdoId: '00000000-0000-0000-0000-000000000000',
          folderId: '1f000000-0000-0000-0000-000000000000',
          organizationId: '7682'
        }
      });
      expect(res).toBeDefined();
      expect(
        serviceContext.dal.tdo.updateFolderInSearchIndex.mock.calls.length
      ).toBe(1);
    });
  });
  describe('#removeTDOFromFolders', () => {
    it('should remove TDO from folders with string ID', async () => {
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: '123'
        },
        {
          tree_object_id: '234'
        }
      ]);
      const res = await dal.removeTDOFromFolders(mockUtil.makeContext(), {
        id: '123'
      });
      expect(res.length).toBe(2);
    });
    it('should remove TDO from folders with int ID', async () => {
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: '123'
        },
        {
          tree_object_id: '234'
        }
      ]);
      const res = await dal.removeTDOFromFolders(mockUtil.makeContext(), {
        id: 123
      });
      expect(res.length).toBe(2);
    });
  });

  describe('#getTreeObjectInfoForObject', () => {
    it('should get tree object info', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '123',
          type: 'folder',
          object_id: 'o123'
        }
      ]);
      const res = await dal.getTreeObjectInfoForObject('123');
      expect(res).toBeDefined();
      expect(res.id).toBe('123');
      expect(res.type).toBe('folder');
      expect(res.object_id).toBe('o123');
    });
    it('should throw if no tree object info', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      try {
        await dal.getTreeObjectInfoForObject('123');
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
  });

  describe('#getRootFolder', () => {
    it('should get root folders for user', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          root_folder_id: 'r123',
          root_folder_type_id: 1,
          organization_id: 7682,
          user_id: 'u123',
          object_id: 'o123',
          tree_object_type_id: 1,
          creation_date: new Date(),
          last_updated_date: new Date(),
          order_index: 1,
          tree_object_id: 'to123',
          shared_with: [],
          shares_to: []
        }
      ]);
      const res = await dal.getRootFolders(mockUtil.makeContext(), {
        type: 'folder'
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(1);
      expect(res[0].rootFolderId).toBe('r123');
      expect(res[0].orderIndex).toBe(1);
      expect(res[0].userId).toBe('u123');
      expect(res[0].creationDate).toBeDefined();
      expect(res[0].lastUpdatedDate).toBeDefined();
    });
    it('should handle no matching root folder', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      const res = await dal.getRootFolders(mockUtil.makeContext(), {
        type: 'folder'
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(0);
    });
  });

  describe('#getFolderNew', () => {
    it('when writeOnly is false, should get folder for when org and user have read access', async () => {
      const testOrgId = 'org_id';
      const args = {
        id: '47b428ce-390c-41ee-9382-56ee74b2a821',
        organizationId: testOrgId,
        __writeOnly: false
      };
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: args.id,
          sharedWith: {
            read: [testOrgId],
            write: []
          }
        }
      ]);
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return {
          organizationId: testOrgId,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        };
      });
      serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValueOnce([
        {
          hasPermission: true
        }
      ]);
      const res = await dal.getFolderNew(mockUtil.makeContext(), args);
      expect(res).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.id).toBe(args.id);
    });
    it('when writeOnly is false, should throw error when org has read access but user does not', async () => {
      const testOrgId = 'org_id';
      const args = {
        id: '47b428ce-390c-41ee-9382-56ee74b2a821',
        organizationId: testOrgId,
        __writeOnly: false
      };
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: args.id,
          sharedWith: {
            read: [testOrgId],
            write: []
          }
        }
      ]);
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return {
          organizationId: testOrgId,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        };
      });
      serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValueOnce([
        {
          hasPermission: false
        }
      ]);
      let res, err;
      try {
        res = await dal.getFolderNew(mockUtil.makeContext(), args);
      } catch (e) {
        err = e;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toBeDefined();
      expect(err.message).toContain(
        'The folder was not found. It either does not exist or you or your organization do not have access to it.'
      );
    });
    it('when writeOnly is false, should throw error when org does not have read or write access', async () => {
      const testOrgId = 'org_id';
      const args = {
        id: '47b428ce-390c-41ee-9382-56ee74b2a821',
        organizationId: testOrgId,
        __writeOnly: false
      };
      const context = mockUtil.makeContext();
      const regularUserContext = {
        ...context,
        _authInfo: {
          token: 'foo'
        }
      };
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: args.id,
          typeId: dal.TREE_OBJECT_TYPE.ROOT_FOLDER,
          sharedWith: {
            read: ['some_other_org_id'],
            write: []
          }
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: args.id,
          typeId: dal.TREE_OBJECT_TYPE.ROOT_FOLDER,
          sharedWith: {
            read: ['some_other_org_id'],
            write: []
          }
        }
      ]);
      let res, err;
      try {
        res = await dal.getFolderNew(regularUserContext, args);
      } catch (e) {
        err = e;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toBeDefined();
      expect(err.message).toContain(
        'The folder was not found. It either does not exist or you or your organization do not have access to it.'
      );
    });
    it('when writeOnly is true, should get folder for when org and user have write access', async () => {
      const testOrgId = 'org_id';
      const args = {
        id: '47b428ce-390c-41ee-9382-56ee74b2a821',
        organizationId: testOrgId,
        __writeOnly: true
      };
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: args.id,
          sharedWith: {
            read: [],
            write: [testOrgId]
          }
        }
      ]);
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return {
          organizationId: testOrgId,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        };
      });
      serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValueOnce([
        {
          hasPermission: true
        }
      ]);
      const res = await dal.getFolderNew(mockUtil.makeContext(), args);
      expect(res).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.id).toBe(args.id);
    });
    it('when writeOnly is true, should throw error when org has write access but user does not', async () => {
      const testOrgId = 'org_id';
      const args = {
        id: '47b428ce-390c-41ee-9382-56ee74b2a821',
        organizationId: testOrgId,
        __writeOnly: true
      };
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: args.id,
          sharedWith: {
            read: [],
            write: [testOrgId]
          }
        }
      ]);
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return {
          organizationId: testOrgId,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        };
      });
      serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValueOnce([
        {
          hasPermission: false
        }
      ]);
      let res, err;
      try {
        res = await dal.getFolderNew(mockUtil.makeContext(), args);
      } catch (e) {
        err = e;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toBeDefined();
      expect(err.message).toContain(
        'The folder was not found. It either does not exist or you or your organization do not have access to it.'
      );
    });
    it('when writeOnly is true, should throw error when org does not have write access', async () => {
      const testOrgId = 'org_id';
      const args = {
        id: '47b428ce-390c-41ee-9382-56ee74b2a821',
        organizationId: testOrgId,
        __writeOnly: true
      };
      const context = mockUtil.makeContext();
      const regularUserContext = {
        ...context,
        _authInfo: {
          token: 'foo'
        }
      };
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: args.id,
          typeId: dal.TREE_OBJECT_TYPE.ROOT_FOLDER,
          sharedWith: {
            read: [testOrgId],
            write: []
          }
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: args.id,
          typeId: dal.TREE_OBJECT_TYPE.ROOT_FOLDER,
          sharedWith: {
            read: [testOrgId],
            write: []
          }
        }
      ]);
      let res, err;
      try {
        res = await dal.getFolderNew(regularUserContext, args);
      } catch (e) {
        err = e;
      }
      expect(res).toBeUndefined();
      expect(err).toBeDefined();
      expect(err.message).toBeDefined();
      expect(err.message).toContain(
        'The folder was not found. It either does not exist or you or your organization do not have access to it.'
      );
    });
    it('when writeOnly is false and rbac feature is enabled, should get folder for internal token', async () => {
      const ctx = mockUtil.makeContext({
        authType: 'api_internal'
      });
      const testOrgId = 'org_id';
      const args = {
        id: '47b428ce-390c-41ee-9382-56ee74b2a821',
        organizationId: testOrgId,
        __writeOnly: false
      };
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: args.id,
          sharedWith: {
            read: [],
            write: []
          }
        }
      ]);
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return {
          organizationId: testOrgId,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        };
      });
      const res = await dal.getFolderNew(ctx, args);
      expect(res).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.id).toBe(args.id);
    });
    it('when writeOnly is true and rbac feature is enabled, should get folder for internal token', async () => {
      const ctx = mockUtil.makeContext({
        authType: 'api_internal'
      });
      const testOrgId = 'org_id';
      const args = {
        id: '47b428ce-390c-41ee-9382-56ee74b2a821',
        organizationId: testOrgId,
        __writeOnly: true
      };
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: args.id,
          sharedWith: {
            read: [],
            write: []
          }
        }
      ]);
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return {
          organizationId: testOrgId,
          kvp: {
            features: {
              enableRBACFeature: 'enabled'
            }
          }
        };
      });
      const res = await dal.getFolderNew(ctx, args);
      expect(res).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.id).toBe(args.id);
    });
    it('when writeOnly is false and rbac feature is disabled, should get folder for internal token', async () => {
      const ctx = mockUtil.makeContext({
        authType: 'api_internal'
      });
      const testOrgId = 'org_id';
      const args = {
        id: '47b428ce-390c-41ee-9382-56ee74b2a821',
        organizationId: testOrgId,
        __writeOnly: false
      };
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: args.id,
          sharedWith: {
            read: [],
            write: []
          }
        }
      ]);
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return {
          organizationId: testOrgId,
          kvp: {
            features: {
              enableRBACFeature: 'disabled'
            }
          }
        };
      });
      const res = await dal.getFolderNew(ctx, args);
      expect(res).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.id).toBe(args.id);
    });
    it('when writeOnly is true and rbac feature is disabled, should get folder for internal token', async () => {
      const ctx = mockUtil.makeContext({
        authType: 'api_internal'
      });
      const testOrgId = 'org_id';
      const args = {
        id: '47b428ce-390c-41ee-9382-56ee74b2a821',
        organizationId: testOrgId,
        __writeOnly: true
      };
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: args.id,
          sharedWith: {
            read: [],
            write: []
          }
        }
      ]);
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return {
          organizationId: testOrgId,
          kvp: {
            features: {
              enableRBACFeature: 'disabled'
            }
          }
        };
      });
      const res = await dal.getFolderNew(ctx, args);
      expect(res).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.id).toBe(args.id);
    });
  });

  describe('#getParentTreeItem', () => {
    it('should get parent tree item', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          type_id: 2,
          tree_object_id: 'to123',
          tree_object_type_id: 2,
          shared_with: [],
          parent_tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          child_tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          depth: 2
        }
      ]);
      const res = await dal.getParentTreeItem(mockUtil.makeContext(), {
        treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195'
      });
      expect(res).toBeDefined();
      expect(res.typeId).toBe(2);
      expect(res.treeObjectId).toBe('to123');
      expect(res.depth).toBe(2);
    });
    it('should handle null parent tree item', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      const res = await dal.getParentTreeItem(mockUtil.makeContext(), {
        treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195'
      });
      expect(res).toBeDefined();
      expect(typeof res).toBe('object');
      expect(Object.keys(res).length).toBe(0);
    });
  });

  describe('#getSubfolders', () => {
    it('should get subfolders', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_folder_name: 'myfolder',
          tree_folder_description: 'My Folder',
          id: 'tf123',
          type_id: 1,
          object_id: 'tf123',
          tree_object_id: 'to123',
          created_date_time: new Date(),
          modified_date_time: new Date(),
          tree_object_status: 1,
          shared_with: [],
          order_index: 2,
          child_tree_object_id: 'to123',
          parent_tree_object_id: 'po123',
          depth: 1
        },
        {
          tree_folder_name: 'myfolder2',
          tree_folder_description: 'My Folder 2',
          id: 'tf124',
          type_id: 1,
          object_id: 'tf124',
          tree_object_id: 'to124',
          created_date_time: new Date(),
          modified_date_time: new Date(),
          tree_object_status: 1,
          shared_with: [],
          order_index: 1,
          child_tree_object_id: 'to124',
          parent_tree_object_id: 'po123',
          depth: 1
        }
      ]);
      const res = await dal.getSubfolders(mockUtil.makeContext, {
        id: 'f123'
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(2);
    });
    it('should get subfolders with names args', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_folder_name: 'myfolder',
            tree_folder_description: 'My Folder',
            id: 'tf123',
            type_id: 1,
            object_id: 'tf123',
            tree_object_id: 'to123',
            created_date_time: new Date(),
            modified_date_time: new Date(),
            tree_object_status: 1,
            shared_with: [],
            order_index: 2,
            child_tree_object_id: 'to123',
            parent_tree_object_id: 'po123',
            depth: 1
          },
          {
            tree_folder_name: 'myfolder2',
            tree_folder_description: 'My Folder 2',
            id: 'tf124',
            type_id: 1,
            object_id: 'tf124',
            tree_object_id: 'to124',
            created_date_time: new Date(),
            modified_date_time: new Date(),
            tree_object_status: 1,
            shared_with: [],
            order_index: 1,
            child_tree_object_id: 'to124',
            parent_tree_object_id: 'po123',
            depth: 1
          }
        ],
        false,
        ['parent_tree_object_id ='],
        (sql, params) => {
          expect(sql).not.toMatch(/c\.depth\s=\s1/);
          expect(params[0]).toEqual('f123');
          expect(params[1]).toEqual('myfolder');
          expect(params[2]).toEqual('myfolder2');
          return true;
        }
      );
      const res = await dal.getSubfolders(mockUtil.makeContext, {
        id: 'f123',
        names: ['myfolder', 'myfolder2']
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(2);
    });
    it('should get no subfolders', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      const res = await dal.getSubfolders(mockUtil.makeContext, {
        id: 'f123'
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(0);
    });
    it('should get subfolders with entityTags args', async () => {
      serviceContext.dal.entityTags.getEntityIdsByTagKeys.mockImplementation(
        (arg1, arg2, arg3) => {
          expect(arg1).toMatchObject(['tag_001', 'tag_002']);
          expect(arg2).toBe(7682);
          expect(arg3).toEqual('folder');
          return Promise.resolve(['tf123', 'tf124']);
        }
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_folder_name: 'myfolder',
            tree_folder_description: 'My Folder',
            id: 'tf123',
            type_id: 1,
            object_id: 'tf123',
            tree_object_id: 'to123',
            created_date_time: new Date(),
            modified_date_time: new Date(),
            tree_object_status: 1,
            shared_with: [],
            order_index: 2,
            child_tree_object_id: 'to123',
            parent_tree_object_id: 'po123',
            depth: 1
          },
          {
            tree_folder_name: 'myfolder2',
            tree_folder_description: 'My Folder 2',
            id: 'tf124',
            type_id: 1,
            object_id: 'tf124',
            tree_object_id: 'to124',
            created_date_time: new Date(),
            modified_date_time: new Date(),
            tree_object_status: 1,
            shared_with: [],
            order_index: 1,
            child_tree_object_id: 'to124',
            parent_tree_object_id: 'po123',
            depth: 1
          }
        ],
        false,
        ['parent_tree_object_id ='],
        (sql, params) => {
          expect(sql).not.toMatch(/c\.depth\s=\s1/);
          expect(params[0]).toEqual('f123');
          expect(params[1]).toMatchObject(['tf123', 'tf124']);
          return true;
        }
      );
      const res = await dal.getSubfolders(mockUtil.makeContext(), {
        id: 'f123',
        entityTags: [
          { key: 'tag_001', value: 'tag_value_001' },
          { key: 'tag_002', value: 'tag_value_002' }
        ]
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(2);
      expect(
        serviceContext.dal.entityTags.getEntityIdsByTagKeys
      ).toHaveBeenCalled();
    });
    it('should return empty array if no folders with input entity tags.', async () => {
      serviceContext.dal.entityTags.getEntityIdsByTagKeys.mockImplementation(
        (arg1, arg2, arg3) => {
          expect(arg1).toMatchObject(['tag_001', 'tag_002']);
          expect(arg2).toBe(7682);
          expect(arg3).toEqual('folder');
          return Promise.resolve([]);
        }
      );

      const res = await dal.getSubfolders(mockUtil.makeContext(), {
        id: 'f123',
        entityTags: [
          { key: 'tag_001', value: 'tag_value_001' },
          { key: 'tag_002', value: 'tag_value_002' }
        ]
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(0);
      expect(
        serviceContext.dal.entityTags.getEntityIdsByTagKeys
      ).toHaveBeenCalled();
    });

    it('should apply RBAC auth filter when provided', async () => {
      const mockAuthFilter = jest.fn((idColumn, paramIndex) => {
        return {
          where: `${idColumn} IN (SELECT folder_id FROM rbac_folders WHERE auth_group_id = ANY($${paramIndex}))`,
          join: 'INNER JOIN rbac_folders rf ON rf.folder_id = f.tree_folder_id',
          args: [['auth-group-1', 'auth-group-2']],
          metadata: {
            resourceType: 'Folder'
          }
        };
      });

      const context = mockUtil.makeContext();
      context._rbacAuthFilter = mockAuthFilter;

      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_folder_name: 'authorized_folder',
            tree_folder_description: 'Authorized Folder',
            id: 'tf123',
            type_id: 1,
            object_id: 'tf123',
            tree_object_id: 'to123',
            created_date_time: new Date(),
            modified_date_time: new Date(),
            tree_object_status: 1,
            shared_with: [],
            order_index: 1,
            child_tree_object_id: 'to123',
            parent_tree_object_id: 'po123',
            depth: 1
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(sql).toContain(
            'INNER JOIN rbac_folders rf ON rf.folder_id = f.tree_folder_id'
          );
          expect(sql).toContain(
            'f.tree_folder_id IN (SELECT folder_id FROM rbac_folders WHERE auth_group_id = ANY($'
          );
          // Verify the first param is the folder ID
          expect(params[0]).toBe('f123');
          // The auth groups array is spread as a single element (not flattened further)
          expect(params[1]).toEqual(['auth-group-1', 'auth-group-2']);
          return true;
        }
      );

      const res = await dal.getSubfolders(context, {
        id: 'f123',
        organizationId: 7682
      });

      expect(res).toBeDefined();
      expect(res.length).toBe(1);
      expect(mockAuthFilter).toHaveBeenCalledWith(
        'f.tree_folder_id',
        expect.any(Number)
      );
    });

    it('should handle RBAC auth filter with non-Folder resource type', async () => {
      const mockAuthFilter = jest.fn((idColumn, paramIndex) => {
        return {
          where: `${idColumn} IN (SELECT id FROM other_table)`,
          join: 'INNER JOIN other_table ot ON ot.id = f.tree_folder_id',
          args: [['auth-group-1']],
          metadata: {
            resourceType: 'TDO' // Wrong resource type
          }
        };
      });

      const context = mockUtil.makeContext();
      context._rbacAuthFilter = mockAuthFilter;

      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_folder_name: 'myfolder',
            tree_folder_description: 'My Folder',
            id: 'tf123',
            type_id: 1,
            object_id: 'tf123',
            tree_object_id: 'to123',
            created_date_time: new Date(),
            modified_date_time: new Date(),
            tree_object_status: 1,
            shared_with: [],
            order_index: 1,
            child_tree_object_id: 'to123',
            parent_tree_object_id: 'po123',
            depth: 1
          }
        ],
        false,
        [],
        (sql, params) => {
          // Should NOT contain the RBAC filter since resource type doesn't match
          expect(sql).not.toContain('INNER JOIN other_table');
          expect(sql).not.toContain('other_table');
          expect(params[0]).toBe('f123');
          // Should only have the folder ID param, not the auth groups
          expect(params.length).toBe(1);
          return true;
        }
      );

      const res = await dal.getSubfolders(context, {
        id: 'f123',
        organizationId: 7682
      });

      expect(res).toBeDefined();
      expect(res.length).toBe(1);
    });

    describe('#_getSubfolderQuery', () => {
      it('sql query should include id condition', async () => {
        const args = {
          id: 'f123'
        };

        const { sql, sqlArgs } = dal._getSubfolderQuery(args);
        expect(sqlArgs.length).toBe(1);
        expect(sqlArgs[0]).toBe(args.id);
        expect(sql).toContain(`c.parent_tree_object_id = $1`);
      });

      it('sql query should include default order by', async () => {
        const args = {
          id: 'f123',
          orderBy: []
        };

        const { sql, sqlArgs } = dal._getSubfolderQuery(args);
        expect(sqlArgs.length).toBe(1);
        expect(sqlArgs[0]).toBe(args.id);
        expect(sql).toContain(`c.parent_tree_object_id = $1`);
        expect(sql).toContain(`t.creation_date ASC`);
      });

      it('sql query should include order by fields', async () => {
        const args = {
          id: 'f123',
          orderBy: [
            { field: `name`, direction: `asc` },
            { field: `createdDateTime`, direction: `desc` }
          ]
        };

        const { sql, sqlArgs } = dal._getSubfolderQuery(args);
        expect(sqlArgs.length).toBe(1);
        expect(sqlArgs[0]).toBe(args.id);
        expect(sql).toContain(`c.parent_tree_object_id = $1`);
        expect(sql).toContain(`f.tree_folder_name asc`);
        expect(sql).toContain(`t.creation_date desc`);
      });

      it('sql query should include folderIds condition', async () => {
        const args = {
          id: 'f123',
          folderIds: ['tf123', 'tf124']
        };

        const { sql, sqlArgs } = dal._getSubfolderQuery(args);
        expect(sqlArgs.length).toBe(2);
        expect(sqlArgs[0]).toBe(args.id);
        expect(sqlArgs[1]).toMatchObject(['tf123', 'tf124']);
        expect(sql).toContain(`t.object_id = ANY($2::text[])`);
      });
    });
  });

  describe('#getFolderPath', () => {
    it('gets folder path', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_type_id: 1
        },
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_type_id: 4
        }
      ]);
      // root folder
      serviceContext.dbConnections['media_platform'].read._push([
        {
          root_folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          root_folder_type_id: 1,
          organization_id: 7682,
          user_id: 'u123',
          object_id: 'o123',
          tree_object_type_id: 4,
          type_id: 4,
          creation_date: new Date(),
          last_updated_date: new Date(),
          order_index: 1,
          tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          shared_with: [],
          shares_to: []
        }
      ]);
      // get parent of root - there isn't one
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          type_id: 1,
          organization_id: 7682,
          user_id: 'u123',
          shares_to: []
        }
      ]);
      // get 2nd level folder
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_folder_name: 'folder1',
          tree_folder_description: 'folder 1',
          id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          type_id: 1,
          object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          order_index: 2,
          created_date_time: new Date(),
          modified_date_time: new Date(),
          tree_object_status: 1,
          shared_with: []
        }
      ]);

      // get its parent, the root
      serviceContext.dbConnections['media_platform'].read._push([
        {
          type_id: 4,
          tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_type_id: 4,
          shared_with: [],
          parent_tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          child_tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          depth: 2
        }
      ]);
      // get root folder entry
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          type_id: 4,
          organization_id: 7682,
          user_id: 'u123',
          shares_to: []
        }
      ]);
      serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValue([
        {
          hasPermission: true
        }
      ]);
      const res = await dal.getFolderPath(
        mockUtil.makeContext(),
        {
          treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195'
        },
        {}
      );
      expect(res).toBeDefined();
      expect(res.length).toBe(2);
    });
  });

  describe('#getFolder', () => {
    it('should get a folder', async () => {
      mockForGetFolder();
      serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValueOnce([
        {
          hasPermission: true
        }
      ]);
      const res = await dal.getFolder(mockUtil.makeContext(), {
        id: '2ace46d4-9e27-4fea-9623-75231ff21195',
        organizationId: '7682'
      });
      expect(res).toBeDefined();
    });
    it('should not found on no folder', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      try {
        await dal.getFolder(mockUtil.makeContext(), {
          id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: '7682'
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
    it('should error on invalid id', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      try {
        await dal.getFolder(mockUtil.makeContext(), {
          id: 'not a guid',
          organizationId: '7682'
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
    it('should error on no user or org or app id', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      try {
        await dal.getFolder(mockUtil.makeContext(), {
          id: '2ace46d4-9e27-4fea-9623-75231ff21195'
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
    it('should look up org ID if not passed', async () => {
      serviceContext.dbConnections['sso'].read._push(
        [
          {
            id: 7682
          }
        ],
        false
      );
      mockForGetFolder();
      serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValueOnce([
        {
          hasPermission: true
        }
      ]);
      const res = await dal.getFolder(mockUtil.makeContext(), {
        id: '2ace46d4-9e27-4fea-9623-75231ff21195',
        applicationId: '333346d4-9e27-4fea-9623-75231ff21195'
      });
      expect(res).toBeDefined();
    });
  });

  describe('#getChildTDOs', () => {
    it('should get child TDOs', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          object_id: '1230001'
        },
        {
          object_id: '1230002'
        },
        {
          object_id: '1230003'
        }
      ]);
      serviceContext.dbConnections['core'].read._push([
        {
          id: '1230001',
          source_id: '123',
          is_public: true,
          application_id: 'a123',
          created_date_time: new Date(),
          modified_date_time: new Date(),
          start_date_time: new Date(),
          stop_date_time: new Date(),
          json: {},
          scheduled_job_id: '1234'
        },
        {
          id: '1230002',
          source_id: '124',
          is_public: false,
          application_id: 'a123',
          created_date_time: new Date(),
          modified_date_time: new Date(),
          start_date_time: new Date(),
          stop_date_time: new Date(),
          json: {}
        },
        {
          id: '1230003',
          is_public: false,
          application_id: 'a123',
          created_date_time: new Date(),
          modified_date_time: new Date(),
          start_date_time: new Date(),
          stop_date_time: new Date(),
          json: {}
        }
      ]);
      const res = await dal.getChildTDOs(
        mockUtil.makeContext(),
        '2ace46d4-9e27-4fea-9623-75231ff21195',
        {
          offset: 0,
          limit: 10
        }
      );

      expect(res).toBeDefined();
      expect(res.count).toBe(3);
      expect(res.records.length).toBe(3);
    });
  });

  describe('#getChildWatchlists', () => {
    it('should get child Watchlists', async () => {
      const getTreeObjectResults = [
        {
          object_id: '1230001',
          tree_object_id: 'tree_object_id_1'
        },
        {
          object_id: '1230002',
          tree_object_id: 'tree_object_id_2'
        }
      ];
      serviceContext.dbConnections['media_platform'].read._push(
        getTreeObjectResults
      );
      _.set(serviceContext, 'dal.watchlist.getWatchlists', () => {
        return {
          records: [
            {
              id: '1230001'
            },
            {
              id: '1230002'
            }
          ],
          count: 2,
          limit: 10,
          offset: 0
        };
      });
      const res = await dal.getChildWatchlists(mockUtil.makeContext(), {
        treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195',
        offset: 0,
        limit: 10
      });

      expect(res).toBeDefined();
      expect(res.count).toBe(2);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(10);
      expect(res.records.length).toBe(2);
      expect(res.records[0].id).toBe('1230001');
      expect(res.records[0].treeObjectId).toBe('tree_object_id_1');
      expect(res.records[1].id).toBe('1230002');
      expect(res.records[1].treeObjectId).toBe('tree_object_id_2');
    });
    it('should get empty page', async () => {
      const getTreeObjectResults = [];
      serviceContext.dbConnections['media_platform'].read._push(
        getTreeObjectResults
      );
      const res = await dal.getChildWatchlists(
        mockUtil.makeContext(),
        '2ace46d4-9e27-4fea-9623-75231ff21195',
        {
          offset: 0,
          limit: 10
        }
      );
      expect(res).toBeDefined();
      expect(res.records.length).toBe(0);
      expect(res.count).toBe(0);
    });

    it('should get child Watchlists by name', async () => {
      const getTreeObjectResults = [
        {
          object_id: '1230001',
          tree_object_id: 'tree_object_id_1'
        },
        {
          object_id: '1230002',
          tree_object_id: 'tree_object_id_2'
        }
      ];
      serviceContext.dbConnections['media_platform'].read._push(
        getTreeObjectResults
      );
      _.set(serviceContext, 'dal.watchlist.getWatchlists', (args) => {
        expect(args.names).toEqual(expect.arrayContaining(['test1', 'test2']));
        expect(args.nameMatch).toBe('exact');
        return {
          records: [
            {
              id: '1230001'
            },
            {
              id: '1230002'
            }
          ],
          count: 2,
          limit: 10,
          offset: 0
        };
      });
      const res = await dal.getChildWatchlists(mockUtil.makeContext(), {
        offset: 0,
        limit: 10,
        names: ['test1', 'test2'],
        nameMatch: 'exact',
        treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195'
      });

      expect(res).toBeDefined();
      expect(res.count).toBe(2);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(10);
      expect(res.records.length).toBe(2);
      expect(res.records[0].id).toBe('1230001');
      expect(res.records[0].treeObjectId).toBe('tree_object_id_1');
      expect(res.records[1].id).toBe('1230002');
      expect(res.records[1].treeObjectId).toBe('tree_object_id_2');
    });
  });

  describe('#getChildApplications', () => {
    it('should get child Applications', async () => {
      const getTreeObjectResults = [
        {
          object_id: '1230001',
          tree_object_id: 'tree_object_id_1'
        },
        {
          object_id: '1230002',
          tree_object_id: 'tree_object_id_2'
        }
      ];
      serviceContext.dbConnections['media_platform'].read._push(
        getTreeObjectResults
      );
      _.set(serviceContext, 'dal.application.getApplications', () => {
        return {
          records: [
            {
              id: '1230001'
            },
            {
              id: '1230002'
            }
          ],
          count: 2,
          limit: 10,
          offset: 0
        };
      });
      const res = await dal.getChildApplications(
        mockUtil.makeContext(),
        '2ace46d4-9e27-4fea-9623-75231ff21195',
        {
          offset: 0,
          limit: 10
        }
      );

      expect(res).toBeDefined();
      expect(res.count).toBe(2);
      expect(res.offset).toBe(0);
      expect(res.limit).toBe(10);
      expect(res.records.length).toBe(2);
      expect(res.records[0].id).toBe('1230001');
      expect(res.records[0].treeObjectId).toBe('tree_object_id_1');
      expect(res.records[1].id).toBe('1230002');
      expect(res.records[1].treeObjectId).toBe('tree_object_id_2');
    });
    it('should get empty page', async () => {
      const getTreeObjectResults = [];
      serviceContext.dbConnections['media_platform'].read._push(
        getTreeObjectResults
      );
      const res = await dal.getChildApplications(
        mockUtil.makeContext(),
        '2ace46d4-9e27-4fea-9623-75231ff21195',
        {
          offset: 0,
          limit: 10
        }
      );
      expect(res).toBeDefined();
      expect(res.records.length).toBe(0);
      expect(res.count).toBe(0);
    });
  });

  describe('#getOrCreateUserRootFolder', () => {
    it('should create user root folder', async () => {
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);

      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            object_id: '113e96ec-2bea-49a5-9d98-dc74ac19b396',
            tree_object_id: '213e96ec-2bea-49a5-9d98-dc74ac19b396'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_folder_name: 'new user folder',
          id: '113e96ec-2bea-49a5-9d98-dc74ac19b396',
          tree_folder_description: 'new user folder',
          type_id: 4,
          object_id: '113e96ec-2bea-49a5-9d98-dc74ac19b396',
          tree_object_id: '213e96ec-2bea-49a5-9d98-dc74ac19b396',
          order_index: 1,
          created_date_time: new Date(),
          modified_date_time: new Date(),
          tree_object_status: 1,
          shared_with: []
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '113e96ec-2bea-49a5-9d98-dc74ac19b396',
          type_id: 4,
          organization_id: 7682,
          user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
          shares_to: []
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '113e96ec-2bea-49a5-9d98-dc74ac19b396',
          type_id: 4,
          organization_id: 7682,
          user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
          shares_to: []
        }
      ]);
      serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValueOnce([
        {
          hasPermission: true
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      const res = await dal.getOrCreateUserRootFolder(mockUtil.makeContext(), {
        rootFolderType: 'watchlist',
        userId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
      });
      expect(res).toBeDefined();
    });

    // T13: getOrCreateUserRootFolder used to run V1 and V2 concurrently via
    // v2DalSwitch, and the V2 call never received v1Output at all — so the V2
    // side could never reuse the V1 folder id/tree_object_id for a user-root
    // (e.g. triggered by `user { rootFolder(type: watchlist) }`, not just the
    // createRootFolders mutation). Fixed to use v1Tov2DalSwitch, the same
    // pattern getOrCreateOrgRootFolder already used, so V1 runs first and its
    // result is threaded into the V2 call as v1Output. This test proves the
    // wiring: with V2 enabled for the org, the V2 mock must receive a
    // v1Output shaped like the V1 result (userId set, organizationId falsy —
    // the shape _buildUserRootFolderArgs/getOrCreateRootFolder's singular
    // extraction requires to reuse the V1 id).
    it('threads the V1 result into the V2 call as v1Output when V2 is enabled (T13)', async () => {
      const userId = '513e96ec-2bea-49a5-9d98-dc74ac19b396';
      const v1FolderId = '113e96ec-2bea-49a5-9d98-dc74ac19b396';
      const v1TreeObjectId = '213e96ec-2bea-49a5-9d98-dc74ac19b396';

      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // Require module AFTER setting config, per this file's existing
      // v1Tov2DalSwitch/v2DalSwitch convention. Use a locally-scoped instance
      // (not the outer `dal` const) since v2FoldersAvailable is read once at
      // module load.
      const dalWithV2 = require('../dal/dalFolder')(serviceContext);

      // V1 write path (same shape as "should create user root folder" above)
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            object_id: v1FolderId,
            tree_object_id: v1TreeObjectId
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_folder_name: 'new user folder',
          id: v1FolderId,
          tree_folder_description: 'new user folder',
          type_id: 4,
          object_id: v1FolderId,
          tree_object_id: v1TreeObjectId,
          order_index: 1,
          created_date_time: new Date(),
          modified_date_time: new Date(),
          tree_object_status: 1,
          shared_with: []
        }
      ]);
      // getFolderV1 reads for the V1 result (userId set, organizationId NOT
      // set on a user-root row — mirrors the real root_folder schema)
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: v1FolderId,
          type_id: 4,
          user_id: userId,
          shares_to: []
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: v1FolderId,
          type_id: 4,
          user_id: userId,
          shares_to: []
        }
      ]);
      serviceContext.bll.rbacAuth.hasPermissions.mockResolvedValueOnce([
        { hasPermission: true }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);

      await dalWithV2.getOrCreateUserRootFolder(mockUtil.makeContext(), {
        rootFolderType: 'watchlist',
        userId,
        organizationId: 7682
      });

      // THE ASSERTION: the V2 mock must have been called with a v1Output that
      // carries the V1 folder id and has userId set / organizationId falsy —
      // proving V1 ran first and its result was threaded, not raced/dropped.
      expect(
        serviceContext.dal.folderV2.getOrCreateRootFolder
      ).toHaveBeenCalled();
      const [, v2Args] =
        serviceContext.dal.folderV2.getOrCreateRootFolder.mock.calls[0];
      expect(v2Args.v1Output).toBeDefined();
      expect(v2Args.v1Output.userId).toEqual(userId);
      expect(v2Args.v1Output.organizationId).toBeFalsy();
      expect(
        v2Args.v1Output.id || v2Args.v1Output.objectId
      ).toEqual(v1FolderId);
    });

    it('should fail with no user ID', async () => {
      try {
        await dal.getOrCreateUserRootFolder(mockUtil.makeContext(), {
          rootFolderType: 'watchlist'
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe('userId is required');
      }
    });
    it('should fail with undefined rootFolderTypeId ', async () => {
      try {
        await dal.getOrCreateUserRootFolder(mockUtil.makeContext(), {
          rootFolderType: 'undefined',
          userId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe('rootFolderTypeId is required');
      }
    });
    it('should fail to create root folder ', async () => {
      try {
        serviceContext.dbConnections['media_platform'].write._push([], false, [
          'BEGIN'
        ]);
        serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
        serviceContext.dbConnections['media_platform'].write._push([], false);
        serviceContext.dbConnections['media_platform'].write._push([], false, [
          'ROLLBACK'
        ]);
        serviceContext.dbConnections['sso'].write._push([], false, [
          'ROLLBACK'
        ]);
        await dal.getOrCreateUserRootFolder(mockUtil.makeContext(), {
          rootFolderType: 'watchlist',
          userId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        });
      } catch (err) {
        expect(err.message).toBe('Failed to get or create root folder');
      }
    });
  });

  describe('#getParentFolder', () => {
    it('should return null', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      const res = await dal.getParentFolder(
        '1ace46d4-9e27-4fea-9623-75231ff21195',
        '7682'
      );
      expect(res).toBeNull();
    });
    it('should return parent folder', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [{}, {}],
        false
      );
      const res = await dal.getParentFolder(
        '1ace46d4-9e27-4fea-9623-75231ff21195',
        '7682'
      );
      expect(res).toBeDefined();
    });
    it('should fail The server was unable to retrieve folder information.', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      try {
        await dal.getParentFolder(
          '1ace46d4-9e27-4fea-9623-75231ff21195',
          'error'
        );
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.message).toBe(
          'The server was unable to retrieve folder information.'
        );
      }
    });
  });
  describe('#getOrCreateOrgRootFolder', () => {
    it('should create org folder', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            object_id: '113e96ec-2bea-49a5-9d98-dc74ac19b396',
            tree_object_id: '213e96ec-2bea-49a5-9d98-dc74ac19b396'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_folder_name: 'new user folder',
          id: '113e96ec-2bea-49a5-9d98-dc74ac19b396',
          tree_folder_description: 'new user folder',
          type_id: 4,
          object_id: '113e96ec-2bea-49a5-9d98-dc74ac19b396',
          tree_object_id: '213e96ec-2bea-49a5-9d98-dc74ac19b396',
          order_index: 1,
          created_date_time: new Date(),
          modified_date_time: new Date(),
          tree_object_status: 1,
          shared_with: []
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '113e96ec-2bea-49a5-9d98-dc74ac19b396',
          type_id: 4,
          organization_id: 7682,
          user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
          shares_to: []
        }
      ]);
      const res = await dal.getOrCreateOrgRootFolder(mockUtil.makeContext(), {
        organizationId: 7682,
        rootFolderType: 'cms'
      });
      expect(res).toBeDefined();
    });

    it('should error if unrecognized folder type', async () => {
      try {
        await dal.getOrCreateOrgRootFolder(mockUtil.makeContext(), {
          organizationId: 7682,
          rootFolderType: 'nothing'
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should error if no org ID', async () => {
      try {
        await dal.getOrCreateOrgRootFolder(mockUtil.makeContext(), {
          rootFolderType: 'cms'
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should failed to create root folder', async () => {
      try {
        serviceContext.dbConnections['media_platform'].read._push([], false);
        const res = await dal.getOrCreateOrgRootFolder(mockUtil.makeContext(), {
          organizationId: 7682,
          rootFolderType: 'cms'
        });
        expect(res).toBeDefined();
      } catch (err) {
        expect(err.message).toBe('Failed to create root folder');
      }
    });
  });

  describe('#getOrCreateRootFolders', () => {
    it('should get root folders if they exist - case new', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          type_id: 4,
          organization_id: 7682,
          shares_to: []
        },
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          type_id: 4,
          user_id: 'u123',
          shares_to: []
        }
      ]);
      const res = await dal.getOrCreateRootFolders(mockUtil.makeContext(), {
        organizationId: 7682
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(2);
    });

    it('should create org if only user exists - case new', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          type_id: 3,
          user_id: 'u123',
          shares_to: []
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          root_folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organization_id: 7682,
          root_folder_type_id: 3
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_type_id: 3,
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          order_index: 1,
          creation_date: new Date(),
          last_updated_date: new Date(),
          tree_object_status: 1
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          parent_tree_object_id: null,
          child_tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          depth: 1
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      const res = await dal.getOrCreateRootFolders(mockUtil.makeContext(), {
        organizationId: 7682,
        type: 'cms'
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(2);
    });

    it('should create user if only org exists - case new', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          type_id: 3,
          organization_id: '7682',
          shares_to: []
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          root_folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          user_id: 'u123',
          root_folder_type_id: 3
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_type_id: 3,
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          order_index: 1,
          creation_date: new Date(),
          last_updated_date: new Date(),
          tree_object_status: 1
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          parent_tree_object_id: null,
          child_tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          depth: 1
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      const res = await dal.getOrCreateRootFolders(mockUtil.makeContext(), {
        organizationId: 7682,
        type: 'cms'
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(2);
    });

    it('should get root folders if rootFolders empty and only org exists - case new', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          root_folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organization_id: 7682,
          root_folder_type_id: 3
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_type_id: 3,
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          order_index: 1,
          creation_date: new Date(),
          last_updated_date: new Date(),
          tree_object_status: 1
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          parent_tree_object_id: null,
          child_tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          depth: 1
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);

      let context = mockUtil.makeContext();
      context._authInfo = {};
      const res = await dal.getOrCreateRootFolders(context, {
        organizationId: 7682,
        type: 'cms'
      });
      expect(res).toBeDefined();
    });

    it('should get root folders if user and only org exists - case new', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);

      serviceContext.dbConnections['media_platform'].read._push([
        {
          root_folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organization_id: 7682,
          root_folder_type_id: 3
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_type_id: 3,
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          order_index: 1,
          creation_date: new Date(),
          last_updated_date: new Date(),
          tree_object_status: 1
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          parent_tree_object_id: null,
          child_tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          depth: 1
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);

      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          root_folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          organization_id: 7682,
          root_folder_type_id: 3
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_type_id: 3,
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          order_index: 1,
          creation_date: new Date(),
          last_updated_date: new Date(),
          tree_object_status: 1
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          parent_tree_object_id: null,
          child_tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          depth: 1
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      let context = mockUtil.makeContext();
      const res = await dal.getOrCreateRootFolders(context, {
        organizationId: 7682,
        type: 'cms'
      });
      expect(res).toBeDefined();
    });

    it('should get root folders - case old', async () => {
      _.set(
        serviceContext,
        'config.featureFlags.newGetOrCreateRootFolders',
        false
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [{}, {}],
        false
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      const res = await dal.getOrCreateRootFolders(mockUtil.makeContext(), {
        organizationId: 7682,
        rootFolderType: 'watchlist'
      });
      expect(res).toBeDefined();
    });

    it('should throw invalid input - case old', async () => {
      _.set(
        serviceContext,
        'config.featureFlags.newGetOrCreateRootFolders',
        false
      );
      try {
        await dal.getOrCreateRootFolders(mockUtil.makeContext(), {
          organizationId: '0000'
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should throw service faild - case old', async () => {
      _.set(
        serviceContext,
        'config.featureFlags.newGetOrCreateRootFolders',
        false
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'ROLLBACK'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['ROLLBACK']);
      try {
        await dal.getOrCreateRootFolders(mockUtil.makeContext(), {
          organizationId: '0000',
          rootFolderType: 'watchlist'
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('service_failure');
        expect(err.message).toBe('Failed to create new folders.');
      }
    });
    it('should throw fail to create root folders - case old', async () => {
      _.set(
        serviceContext,
        'config.featureFlags.newGetOrCreateRootFolders',
        false
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'ROLLBACK'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['ROLLBACK']);
      try {
        await dal.getOrCreateRootFolders(mockUtil.makeContext(), {
          organizationId: '1234',
          rootFolderType: 'watchlist'
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('service_failure');
        expect(err.message).toBe('Failed to create root folders');
      }
    });
  });

  describe('#getFolderContentTemplates', () => {
    it('should get folder content template', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_content_template_id:
            '33ce46d4-9e27-4fea-9623-75231ff21195',
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          sdo_id: '444e46d4-9e27-4fea-9623-75231ff21195',
          data_registry_id: '144e46d4-9e27-4fea-9623-75231ff21195',
          creation_date: new Date(),
          last_updated_date: new Date()
        }
      ]);
      const res = await dal.getFolderContentTemplates(mockUtil.makeContext(), {
        folderId: '1ace46d4-9e27-4fea-9623-75231ff21195',
        organizationId: 7682
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(1);
      expect(res[0].createdDateTime).toBeDefined();
      expect(res[0].modifiedDateTime).toBeDefined();
    });

    it('should handle if folder content template does not exist', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      const res = await dal.getFolderContentTemplates(mockUtil.makeContext(), {
        folderId: '1ace46d4-9e27-4fea-9623-75231ff21195',
        organizationId: 7682
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(0);
    });
  });

  describe('#deleteFolderContentTemplate', () => {
    it('should delete a folder content template', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_content_template_id:
            '1ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([{}]);
      const res = await dal.deleteFolderContentTemplate(
        mockUtil.makeContext(),
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195'
        }
      );
      expect(res).toBeDefined();
      expect(res.id).toBe('1ace46d4-9e27-4fea-9623-75231ff21195');
    });
    it('should delete a folder content template', async () => {
      serviceContext.dbConnections['media_platform'].write._push([]);
      try {
        await dal.deleteFolderContentTemplate(mockUtil.makeContext(), {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195'
        });
        expect.fail('no throw on not found');
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
    it('should require ID', async () => {
      try {
        await dal.deleteFolderContentTemplate(mockUtil.makeContext(), {});
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should require valid ID', async () => {
      try {
        await dal.deleteFolderContentTemplate(mockUtil.makeContext(), {
          id: 'not_a_uuid'
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
  });

  describe('#updatedFolderContentTemplate', () => {
    it('should update a folder content template - SDO', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_content_template_id:
            '1ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          data_registry_id: '3ace46d4-9e27-4fea-9623-75231ff21195',
          sdo_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_content_template_id:
            '1ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      const res = await dal.updateFolderContentTemplate(
        mockUtil.makeContext(),
        {
          input: {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            sdoId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            schemaId: '3ace46d4-9e27-4fea-9623-75231ff21195'
          }
        }
      );
      expect(res).toBeDefined();
      expect(res.id).toBe('1ace46d4-9e27-4fea-9623-75231ff21195');
    });
    it('should update a folder content template - folder', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_content_template_id:
            '1ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          data_registry_id: '3ace46d4-9e27-4fea-9623-75231ff21195',
          sdo_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          tree_object_content_template_id:
            '1ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      const res = await dal.updateFolderContentTemplate(
        mockUtil.makeContext(),
        {
          input: {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            folderId: '2ace46d4-9e27-4fea-9623-75231ff21195'
          }
        }
      );
      expect(res).toBeDefined();
      expect(res.id).toBe('1ace46d4-9e27-4fea-9623-75231ff21195');
    });

    it('should handle not found', async () => {
      serviceContext.dbConnections['media_platform'].read._push([]);
      try {
        await dal.updateFolderContentTemplate(mockUtil.makeContext(), {
          input: {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            sdoId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            schemaId: '3ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
    it('should handle not found on update', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_content_template_id:
            '1ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([]);

      try {
        await dal.updateFolderContentTemplate(mockUtil.makeContext(), {
          input: {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            sdoId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            schemaId: '3ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
    it('should require ID', async () => {
      try {
        await dal.updateFolderContentTemplate(mockUtil.makeContext(), {
          input: {
            sdoId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            schemaId: '3ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should require valid ID', async () => {
      try {
        await dal.updateFolderContentTemplate(mockUtil.makeContext(), {
          input: {
            id: 'not_a_uuid'
          }
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
  });
  describe('#shareFolder', () => {
    it('should require id', async () => {
      try {
        await dal.shareFolder(mockUtil.makeContext(), {
          input: {
            readOrganizationIds: [1, 2, '123'],
            writeOrganizationIds: [2, '4'],
            organizationId: 7682
          }
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should require valid id', async () => {
      try {
        await dal.shareFolder(mockUtil.makeContext(), {
          input: {
            treeObjectId: 'not_a_uuid',
            readOrganizationIds: [1, 2, '123'],
            writeOrganizationIds: [2, '4'],
            organizationId: 7682
          }
        });
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
    it('should require sharedWith', async () => {
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      try {
        await dal.shareFolder(mockUtil.makeContext(), {
          input: {
            treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should validate org ids before sharing', async () => {
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '1',
          organization_id: 1
        },
        {
          id: '2',
          organization_id: 2
        }
      ]);
      try {
        await dal.shareFolder(mockUtil.makeContext(), {
          input: {
            treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682,
            readOrganizationIds: [1, 2, 9999],
            writeOrganizationIds: [2, 8888]
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });

    it('should share a folder', async () => {
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([
        {
          id: '1',
          organization_id: 1
        },
        {
          id: '2',
          organization_id: 2
        },
        {
          id: '4',
          organization_id: 4
        },
        {
          id: '123',
          organization_id: 123
        }
      ]);
      mockForGetFolder();

      const res = await dal.shareFolder(mockUtil.makeContext(), {
        input: {
          treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195',
          readOrganizationIds: [1, 2, '123'],
          writeOrganizationIds: [2, '4'],
          organizationId: 7682
        }
      });
      expect(res).toBeDefined();

      expect(res.treeObjectId).toBe('2ace46d4-9e27-4fea-9623-75231ff21195');
    });
  });
  describe('#getFolderOverview', () => {
    it('should get folder overview', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            child_tree_object_id: 1
          }
        ],
        false
      );

      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_type_id: '33ce46d4-9e27-4fea-9623-75231ff21195',
            tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            object_id: '444e46d4-9e27-4fea-9623-75231ff21195',
            creation_date: new Date(),
            last_updated_date: new Date()
          }
        ],
        false
      );
      const res = await dal.getFolderOverview(mockUtil.makeContext(), {
        ids: [1],
        organizationId: 7682
      });
      expect(res).toBeDefined();
    });

    it('should throw tree object not found', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            child_tree_object_id: 1
          }
        ],
        false
      );
      try {
        await dal.getFolderOverview(mockUtil.makeContext(), {
          ids: [1, 2],
          organizationId: 7682
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
  });
  describe('#getFolderSummaryDetails', () => {
    it('should get folder summary details', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            child_tree_object_id: 1
          }
        ],
        false
      );

      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_type_id: '33ce46d4-9e27-4fea-9623-75231ff21195',
            tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            object_id: '444e46d4-9e27-4fea-9623-75231ff21195',
            creation_date: new Date(),
            last_updated_date: new Date()
          }
        ],
        false
      );
      const res = await dal.getFolderSummaryDetails(mockUtil.makeContext(), {
        ids: [1],
        organizationId: 7682
      });
      expect(res).toBeDefined();
      expect(res.length).toBe(1);
    });

    it('should throw tree object not found', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            child_tree_object_id: 1
          }
        ],
        false
      );
      try {
        await dal.getFolderSummaryDetails(mockUtil.makeContext(), {
          ids: [1, 2],
          organizationId: 7682
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
  });
  describe('#getSharedFolders', () => {
    it('should throw invalid input', async () => {
      try {
        await dal.getSharedFolders(mockUtil.makeContext(), {});
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe('organizationId is required');
      }
    });

    it('should return empty array', async () => {
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      const res = await dal.getSharedFolders(mockUtil.makeContext(), {
        organizationId: '0000',
        authorizedOrganizationIds: ['0000']
      });
      expect(res.length).toBe(0);
    });
    it('should return shared folders', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_id: 1
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      const res = await dal.getSharedFolders(mockUtil.makeContext(), {
        organizationId: 7682,
        authorizedOrganizationIds: [7682]
      });
      expect(res).toBeDefined();
    });
  });
  describe('#moveFolder', () => {
    it('should move folder', async () => {
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      mockForGetFolder();

      const context = mockUtil.makeContext();
      const res = await dal.moveFolder(context, {
        organizationId: '7682',
        input: {
          organizationId: '7682',
          treeObjectId: '123e4567-e89b-12d3-a456-426655440000',
          newParentTreeObjectId: '123e4567-e89b-12d3-a456-426655440000'
        }
      });
      expect(res).toBeDefined();
    });
    it('should throw organizationId is required', async () => {
      try {
        await dal.moveFolder(mockUtil.makeContext(), {
          input: {}
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe('organizationId is required');
      }
    });
    it('should throw invalid input', async () => {
      try {
        await dal.moveFolder(mockUtil.makeContext(), {
          input: {
            organizationId: 7682
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should return invalid access', async () => {
      try {
        serviceContext.dbConnections['media_platform'].read._push([], false);
        await dal.moveFolder(mockUtil.makeContext(), {
          organizationId: '1',
          input: {
            organizationId: '1',
            treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
      } catch (err) {
        expect(err.name).toBe('not_allowed');
        expect(err.message).toBe('Unable to authorize access to tree object');
      }
    });
    it('should fail to validate folder state', async () => {
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      mockForGetFolder();

      const context = mockUtil.makeContext();
      try {
        await dal.moveFolder(context, {
          organizationId: '7682',
          input: {
            organizationId: '7682',
            treeObjectId: '00000000-0000-0000-0000-000000000000',
            newParentTreeObjectId: '123e4567-e89b-12d3-a456-426655440000'
          }
        });
      } catch (err) {
        expect(err.name).toBe('service_failure');
        expect(err.message).toBe('Failed to validate folder state.');
      }
    });
    it('should fail to retrieve depths to move folder.', async () => {
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      mockForGetFolder();

      const context = mockUtil.makeContext();
      try {
        await dal.moveFolder(context, {
          organizationId: '7682',
          input: {
            organizationId: '7682',
            treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            newParentTreeObjectId: '123e4567-e89b-12d3-a456-426655440000',
            newOrderIndex: -1
          }
        });
      } catch (err) {
        expect(err.name).toBe('service_failure');
        expect(err.message).toBe('Failed to retrieve depths to move folder.');
      }
    });
    it('should fail to retrieve depths to move folder.', async () => {
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      mockForGetFolder();

      const context = mockUtil.makeContext();
      try {
        await dal.moveFolder(context, {
          organizationId: '7682',
          input: {
            organizationId: '7682',
            treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            newParentTreeObjectId: '123e4567-e89b-12d3-a456-426655440000',
            newOrderIndex: 5
          }
        });
      } catch (err) {
        expect(err.name).toBe('invalid_input');
        expect(err.message).toBe(
          'Invalid Depth Restriction: Highest depth would be greater than 5'
        );
      }
    });
    it('should fail to when trying to move parent to child folder', async () => {
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000',
            tree_object_type_id: 3
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '123e4567-e89b-12d3-a456-426655440000'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      mockForGetFolder();

      const context = mockUtil.makeContext();
      try {
        await dal.moveFolder(context, {
          organizationId: '7682',
          input: {
            organizationId: '7682',
            treeObjectId: '123e4567-e89b-12d3-a456-426655440000',
            newParentTreeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
      } catch (err) {
        expect(err.name).toBe('resource_conflict');
        expect(err.message).toBe(
          'Cannot move parent folder into its own subfolder'
        );
      }
    });
  });
  describe('#moveTDO', () => {
    it('should move TDO', async () => {
      serviceContext.dal.tdo.updateFolderInSearchIndex.mockClear();
      mockForGetFolder();
      mockForGetFolder();
      mockV2UnfileFolderItem();
      const context = mockUtil.makeContext();
      const res = await dal.moveTDO(context, {
        organizationId: '7682',
        input: {
          organizationId: '7682',
          oldFolderId: '2ace46d4-9e27-4fea-9623-75231ff21195',
          newFolderId: '2ace46d4-9e27-4fea-9623-75231ff21195',
          tdoId: '00000000-0000-0000-0000-000000000000',
          applicationId: '2ace46d4-9e27-4fea-9623-75231ff21195',
          applicationIds: ['2ace46d4-9e27-4fea-9623-75231ff21195']
        }
      });
      expect(res).toBeDefined();
      expect(
        serviceContext.dal.tdo.updateFolderInSearchIndex.mock.calls.length
      ).toBe(1);
    });
    it('should throw file failed in moveTDO', async () => {
      mockForGetFolder();
      mockForGetFolder();

      const context = mockUtil.makeContext();
      try {
        await dal.moveTDO(context, {
          organizationId: '7682',
          input: {
            organizationId: '7682',
            oldFolderId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            tdoId: '00000000-0000-0000-0000-000000000000',
            applicationId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            applicationIds: ['2ace46d4-9e27-4fea-9623-75231ff21195']
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err).toBeDefined();
      }
    });

    it('should throw error due to olpMigration flag enabled', async () => {
      serviceContext.dal.organization.getOrganization.mockImplementation(() => {
        return {
          kvp: {
            features: {
              olpMigration: true
            }
          }
        };
      });
      const context = mockUtil.makeContext();
      let res;
      try {
        res = await dal.moveTDO(context, {
          organizationId: '7682',
          input: {
            organizationId: '7682'
          }
        });
      } catch (error) {
        expect(res).toBeUndefined();
        expect(
          serviceContext.dal.organization.getOrganization.mock.calls.length
        ).toBe(1);
        expect(error.name).toBe('not_allowed');
        expect(error.message).toBe(
          'OLP is being enabled. During the OLP transition, moving files is disabled because it can lead to resources without ACEs being locked out'
        );
      }
    });
  });
  describe('#moveWatchlist', () => {
    it('should move watch list', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_type_id: '33ce46d4-9e27-4fea-9623-75231ff21195',
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          object_id: '444e46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_type_id: '33ce46d4-9e27-4fea-9623-75231ff21195',
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          object_id: '444e46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            tree_object_type_id: '33ce46d4-9e27-4fea-9623-75231ff21195',
            tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            object_id: '444e46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        false
      );
      const res = await dal.moveWatchlist(
        context,
        {
          parentFolderId: '2ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: '7682'
        },
        { id: '2ace46d4-9e27-4fea-9623-75231ff21195' }
      );
      expect(res).toBeDefined();
    });

    it('should throw error could not be moved to the new folder', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_type_id: '33ce46d4-9e27-4fea-9623-75231ff21195',
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          object_id: '444e46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([], false);
      try {
        await dal.moveWatchlist(
          context,
          {
            parentFolderId: '00000000-0000-0000-0000-000000000000',
            organizationId: '7682'
          },
          { id: '2ace46d4-9e27-4fea-9623-75231ff21195' }
        );
        expect.fail('no throw');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.message).toBe(
          'The watchlist could not be moved to the new folder.'
        );
      }
    });

    it('should return with catched error', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_type_id: '33ce46d4-9e27-4fea-9623-75231ff21195',
          tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          object_id: '444e46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      mockForGetFolder();
      const res = await dal.moveWatchlist(
        context,
        {
          parentFolderId: '00000000-0000-0000-0000-000000000000',
          organizationId: '7682'
        },
        { id: '00000000-0000-0000-0000-000000000000' }
      );
      expect(res).toBeDefined();
    });
    //TODO: Add case catch when get treeObject or oldParentFolderId
  });
  describe('#getRootFolders', () => {
    it('should return root folder with root type', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      const context = mockUtil.makeContext();
      const res = await dal.getRootFolders(context, {
        rootFolderType: 'watchlist',
        skipAuth: true
      });
      expect(res).toBeDefined();
    });
    it('should return root folder with type', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      const context = mockUtil.makeContext();
      const res = await dal.getRootFolders(context, {
        type: 'watchlist',
        id: '00000000-0000-0000-0000-000000000000'
      });
      expect(res).toBeDefined();
    });
  });
  describe('#unfileTDO', () => {
    it('should unfile tdo', async () => {
      serviceContext.dal.tdo.updateFolderInSearchIndex.mockClear();
      const context = mockUtil.makeContext();
      mockForGetFolder();
      mockV2UnfileFolderItem();
      const res = await dal.unfileTDO(context, {
        organizationId: '7682',
        input: {
          organizationId: '7682',
          tdoId: '2ace46d4-9e27-4fea-9623-75231ff21195',
          folderId: '2ace46d4-9e27-4fea-9623-75231ff21195',
          applicationId: '2ace46d4-9e27-4fea-9623-75231ff21195',
          applicationIds: ['2ace46d4-9e27-4fea-9623-75231ff21195']
        }
      });
      expect(res).toBeDefined();
      expect(
        serviceContext.dal.tdo.updateFolderInSearchIndex.mock.calls.length
      ).toBe(1);
    });
  });
  describe('#unfileObject', () => {
    it('should throw an error if objectId is not in the input', async () => {
      const context = mockUtil.makeContext();
      mockForGetFolder();
      let error;
      try {
        await dal.unfileObject(
          context,
          {
            organizationId: '7682',
            input: {
              organizationId: '7682',
              folderId: '2ace46d4-9e27-4fea-9623-75231ff21195'
            }
          },
          'TemporalDataObject'
        );
      } catch (ex) {
        error = ex;
      }
      expect(error).toBeDefined();
      expect(error.message).toContain('The object id is invalid');
    });
    it('should return move tree object', async () => {
      const context = mockUtil.makeContext();
      mockForGetFolder();
      mockV2UnfileFolderItem();
      const res = await dal.unfileObject(
        context,
        {
          organizationId: '7682',
          input: {
            organizationId: '7682',
            objectId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            folderId: '2ace46d4-9e27-4fea-9623-75231ff21195'
          }
        },
        'TemporalDataObject'
      );
      expect(res).toBeDefined();
    });
    it('should return move tree object', async () => {
      const context = mockUtil.makeContext();
      mockForGetFolder();
      try {
        await dal.unfileObject(
          context,
          {
            organizationId: '7682',
            input: {
              organizationId: '7682',
              objectId: '2ace46d4-9e27-4fea-9623-75231ff21195',
              folderId: '00000000-0000-0000-0000-000000000000'
            }
          },
          'TemporalDataObject'
        );
        expect.fail('no throw');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.message).toBe(
          'The object is filed, but in a different folder (2ace46d4-9e27-4fea-9623-75231ff21195).'
        );
      }
    });
  });
  describe('#updateFolder', () => {
    it('should return update folder and update entity tags', async () => {
      mockForGetFolder();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          tree_object_id: '00000000-0000-0000-0000-000000000000'
        }
      ]);
      serviceContext.dal.entityTags.updateEntityTags.mockImplementation(
        (arg1, arg2) => {
          expect(arg1.organizationId).toBe('7682');
          expect(arg1.entityId).toBe('2ace46d4-9e27-4fea-9623-75231ff21195');
          expect(arg1.entityType).toEqual('folder');
          expect(arg1.entityTags).toMatchObject([
            { tagKey: 'tag_001', tagValue: 'tag_value_001' },
            { tagKey: 'tag_002', tagValue: 'tag_value_002' }
          ]);
          return Promise.resolve();
        }
      );
      const context = mockUtil.makeContext();
      const res = await dal.updateFolder(context, {
        input: {
          organizationId: '7682',
          name: 'update folder',
          id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          entityTags: [
            { tagKey: 'tag_001', tagValue: 'tag_value_001' },
            { tagKey: 'tag_002', tagValue: 'tag_value_002' }
          ]
        }
      });
      expect(res).toBeDefined();

      // event
      expect(serviceContext.messageUtil._counter()).toBe(1);
      const messages = serviceContext.messageUtil._messages();
      expect(messages[0].actionInfo).toEqual(
        expect.objectContaining({
          actionName: 'update',
          actionResult: 'success'
        })
      );
    });
    it('should throw error organizationId is required', async () => {
      try {
        const context = mockUtil.makeContext();
        await dal.updateFolder(context, {
          input: {
            name: 'update folder',
            id: '2ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.message).toBe('organizationId is required');
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'update',
            actionResult: 'failure'
          })
        );
      }
    });
    it('should throw error name is required.', async () => {
      try {
        const context = mockUtil.makeContext();
        await dal.updateFolder(context, {
          input: {
            organizationId: '7682',
            id: '2ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'update',
            actionResult: 'failure'
          })
        );
        expect(err).toBeDefined();
        expect(err.message).toBe('the name field is required.');
      }
    });
    it('should throw error Invalid ID format', async () => {
      try {
        const context = mockUtil.makeContext();
        await dal.updateFolder(context, {
          input: {
            organizationId: '7682',
            name: 'folder',
            id: 'test'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err).toBeDefined();
        expect(err.message).toBe(
          'Invalid ID format test. A folder ID must be a UUID.'
        );
        const messages = serviceContext.messageUtil._messages();
        expect(messages[0].actionInfo).toEqual(
          expect.objectContaining({
            actionName: 'update',
            actionResult: 'failure'
          })
        );
      }
    });
  });
  describe('#mapSubfoldersIntoParentFolders', () => {
    it('should map subfolders into parent folders', async () => {
      const res = dal.mapSubfoldersIntoParentFolders([
        {
          treeObjectId: '00000000-0000-0000-0000-000000000000'
        },
        {
          parentTreeObjectId: '00000000-0000-0000-0000-000000000000',
          treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      expect(res).toBeDefined();
    });
  });
  describe('#_validateAccess', () => {
    it('should return validate access', async () => {
      try {
        serviceContext.dbConnections['media_platform'].read._push([], false);
        await dal._validateAccess({
          organizationId: '7682',
          userId: '1',
          treeObjectIds: []
        });
      } catch (err) {
        expect(err.message).toBe('unknown root folder type unknown');
      }
    });
    it('should throw missing options object', async () => {
      try {
        await dal._validateAccess();
      } catch (err) {
        expect(err.message).toBe('Missing options object');
      }
    });
    it('should throw Missing organizationId', async () => {
      try {
        await dal._validateAccess({});
      } catch (err) {
        expect(err.message).toBe('Missing organizationId');
      }
    });
    it('should throw Missing userId', async () => {
      try {
        await dal._validateAccess({
          organizationId: '7682'
        });
      } catch (err) {
        expect(err.message).toBe('Missing userId');
      }
    });
    it('should throw Missing treeObjectIds', async () => {
      try {
        await dal._validateAccess({
          organizationId: '7682',
          userId: '1'
        });
      } catch (err) {
        expect(err.message).toBe('Missing treeObjectIds');
      }
    });
    it('should throw invalid access with unknown root folder type', async () => {
      try {
        await dal._validateAccess({
          organizationId: '7682',
          userId: '1',
          treeObjectIds: [],
          rootFolderType: 'unknown'
        });
      } catch (err) {
        expect(err.message).toBe('unknown root folder type unknown');
      }
    });
  });
  describe('#buildFolderStructure', () => {
    it('should return folder structure', () => {
      const res = dal.buildFolderStructure(
        [
          {
            id: '43ce4632-9e27-4fea-9623-75231ff31232',
            treeObjectTypeId: 1,
            parentTreeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195'
          },
          {
            treeObjectTypeId: 1,
            id: '2ace46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        7682
      );
      expect(res).toBeDefined();
    });
  });
  describe('#validateTreeObject', () => {
    it('should throw not found', () => {
      try {
        dal.validateTreeObject('43ce4632-9e27-4fea-9623-75231ff31232');
        expect.fail('not throw');
      } catch (err) {
        expect(err.name).toBe('not_found');
      }
    });
    it('should throw invalid input', () => {
      try {
        dal.validateTreeObject(
          '43ce4632-9e27-4fea-9623-75231ff31232',
          1,
          [2, 3]
        );
        expect.fail('not throw');
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
  });

  describe('#getObjectIdsFromOpaqueIds', () => {
    it('should get matching objectIds map', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            object_id: 'o123',
            tree_object_id: 't123'
          },
          {
            object_id: 'o234',
            tree_object_id: 't234'
          },
          {
            object_id: 'o345',
            tree_object_id: 't345'
          }
        ],
        false
      );
      const res = await dal.getObjectIdsFromOpaqueIds(context, [
        'o123',
        't234',
        'o345',
        't345'
      ]);
      expect(res).toBeDefined();
      expect(res.get('o123')).toBe('o123');
      expect(res.get('t123')).toBe('o123');
      expect(res.get('t234')).toBe('o234');
      expect(res.get('o234')).toBe('o234');
      expect(res.get('o345')).toBe('o345');
      expect(res.get('t345')).toBe('o345');
    });
  });

  describe('#emitFixupV2FolderRowsEvent', () => {
    it('should emit event', async () => {
      const context = mockUtil.makeContext({ authRole: 'regularUser' });
      _.set(context, '_authInfo.organization.organizationId', 'context_org_id');
      _.set(context, '_authInfo.organization.kvp.features', {
        v2FoldersEnabled: 'enabled'
      });
      const folders = [
        {
          id: 'folder_1'
        },
        {
          id: 'folder_2',
          organizationId: -1
        },
        {
          folderId: 'skip-folder-id'
        }
      ];
      await dal.emitFixupV2FolderRowsEvent(context, folders);
      const messages = serviceContext.messageUtil._messages();
      expect(
        _.every(messages, (m) => m.organizationId === 'context_org_id')
      ).toBe(true);
    });
    it('should emit event without default organization_id if requester is a superadmin user', async () => {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization.organizationId', 'context_org_id');
      _.set(context, '_authInfo.organization.kvp.features', {
        v2FoldersEnabled: 'enabled'
      });
      const folders = [
        {
          id: 'folder_1'
        },
        {
          id: 'folder_2',
          organizationId: -1
        },
        {
          folderId: 'skip-folder-id'
        }
      ];
      await dal.emitFixupV2FolderRowsEvent(context, folders);
      const messages = serviceContext.messageUtil._messages();
      expect(_.every(messages, (m) => _.isNil(m.organizationId))).toBe(true);
    });
  });
});
describe('#getChildCollections', () => {
  it('should get child Collections', async () => {
    const getTreeObjectResults = [
      {
        object_id: '1230001',
        tree_object_id: 'tree_object_id_1'
      },
      {
        object_id: '1230002',
        tree_object_id: 'tree_object_id_2'
      }
    ];
    serviceContext.dbConnections['media_platform'].read._push(
      getTreeObjectResults,
      false
    );
    _.set(serviceContext, 'dal.collection.getCollections', () => {
      return {
        records: [
          {
            id: '1230001'
          },
          {
            id: '1230002'
          }
        ],
        count: 2,
        limit: 10,
        offset: 0
      };
    });
    const res = await dal.getChildCollections(
      mockUtil.makeContext(),
      '2ace46d4-9e27-4fea-9623-75231ff21195',
      {
        offset: 0,
        limit: 10
      }
    );

    expect(res).toBeDefined();
    expect(res.count).toBe(2);
    expect(res.offset).toBe(0);
    expect(res.limit).toBe(10);
    expect(res.records.length).toBe(2);
    expect(res.records[0].id).toBe('1230001');
    expect(res.records[0].treeObjectId).toBe('tree_object_id_1');
    expect(res.records[1].id).toBe('1230002');
    expect(res.records[1].treeObjectId).toBe('tree_object_id_2');
  });
  it('should get empty page', async () => {
    const getTreeObjectResults = [];
    serviceContext.dbConnections['media_platform'].read._push(
      getTreeObjectResults,
      false
    );
    const res = await dal.getChildCollections(
      mockUtil.makeContext(),
      '2ace46d4-9e27-4fea-9623-75231ff21195',
      {
        offset: 0,
        limit: 10
      }
    );
    expect(res).toBeDefined();
    expect(res.records.length).toBe(0);
    expect(res.count).toBe(0);
  });
});

describe('#v2DalSwitch', () => {
  let dal;
  beforeEach(() => {
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('READ operations (isWriteOperation = false)', () => {
    it('should call v1 function when isV2FoldersAvailable is false', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', false);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);
      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v2DalSwitch(v1Func, v2Func, context, 'org123');

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).not.toHaveBeenCalled();
      expect(result).toBe('v1-result');
    });

    it('should call v1 function and v2 silently when org has v2 disabled', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);
      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v2DalSwitch(v1Func, v2Func, context, 'org123');

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).toHaveBeenCalled();
      expect(result).toBe('v1-result');
    });

    it('should call v2 function and v1 silently when org has v2 enabled', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);
      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123',
        false,
        true
      );

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).toHaveBeenCalled();
      expect(result).toBe('v2-result');
    });

    it('should handle v2 silent error', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 21,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);
      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockRejectedValue(new Error('v2-error'));
      const context = mockUtil.makeContext();

      const result = await dal.v2DalSwitch(v1Func, v2Func, context, 'org123');

      expect(result).toBe('v1-result');
    });
  });

  describe('WRITE operations (isWriteOperation = true)', () => {
    it('should call only v1 when both env and org disabled v2', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', false);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123',
        true
      );

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).not.toHaveBeenCalled();
      expect(result).toBe('v1-result');
    });

    it('should call both v1 and v2, return v1 when env=false but org=true', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', false);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123',
        true
      );

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).toHaveBeenCalled();
      expect(result).toBe('v1-result');
    });

    it('should call both v1 and v2, return v1 when env=true but org=false', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123',
        true
      );

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).toHaveBeenCalled();
      expect(result).toBe('v1-result');
    });

    it('should call both v1 and v2, return v2 when both env=true and org=true', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123',
        true
      );

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).toHaveBeenCalled();
      expect(result).toBe('v2-result');
    });

    it('should handle v2 silent error in write mode', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', false);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockRejectedValue(new Error('v2-error'));
      const context = mockUtil.makeContext();

      const result = await dal.v2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123',
        true
      );

      expect(result).toBe('v1-result');
    });

    it('should handle v1 silent error when returning v2', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);
      const v1Func = jest.fn().mockRejectedValue(new Error('v1-error'));
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123',
        true
      );

      expect(result).toBe('v2-result');
    });
  });
});

describe('#v1Tov2DalSwitch', () => {
  let dal;

  beforeEach(() => {
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('READ operations (isWriteOperation = false)', () => {
    it('should call v1 function when isV2FoldersAvailable is false', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', false);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn();
      const context = mockUtil.makeContext();

      const result = await dal.v1Tov2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123'
      );

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).not.toHaveBeenCalled();
      expect(result).toBe('v1-result');
    });

    it('should call v1 then v2, return v1 when org has v2 disabled', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v1Tov2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123'
      );

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).toHaveBeenCalledWith('v1-result');
      expect(result).toBe('v1-result');
    });

    it('should call v1 then v2, return v2 when org has v2 enabled', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v1Tov2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123'
      );

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).toHaveBeenCalledWith('v1-result');
      expect(result).toBe('v2-result');
    });

    it('should handle v2 silent error', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockRejectedValue(new Error('v2-error'));
      const context = mockUtil.makeContext();

      const result = await dal.v1Tov2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123'
      );

      expect(result).toBe('v1-result');
    });
  });

  describe('WRITE operations (isWriteOperation = true)', () => {
    it('should call only v1 when both env and org disabled v2', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', false);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v1Tov2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123',
        true
      );

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).not.toHaveBeenCalled();
      expect(result).toBe('v1-result');
    });

    it('should call v1 then v2, return v1 when env=false but org=true', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', false);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v1Tov2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123',
        true
      );

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).toHaveBeenCalledWith('v1-result');
      expect(result).toBe('v1-result');
    });

    it('should call v1 then v2, return v1 when env=true but org=false', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v1Tov2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123',
        true
      );

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).toHaveBeenCalledWith('v1-result');
      expect(result).toBe('v1-result');
    });

    it('should call v1 then v2, return v2 when both env=true and org=true', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockResolvedValue('v2-result');
      const context = mockUtil.makeContext();

      const result = await dal.v1Tov2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123',
        true
      );

      expect(v1Func).toHaveBeenCalled();
      expect(v2Func).toHaveBeenCalledWith('v1-result');
      expect(result).toBe('v2-result');
    });

    it('should handle v2 silent error in write mode', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', false);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockResolvedValue('v1-result');
      const v2Func = jest.fn().mockRejectedValue(new Error('v2-error'));
      const context = mockUtil.makeContext();

      const result = await dal.v1Tov2DalSwitch(
        v1Func,
        v2Func,
        context,
        'org123',
        true
      );

      expect(result).toBe('v1-result');
    });

    it('should throw error if v1 fails in write mode', async () => {
      _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // Require module AFTER setting config
      dal = require('../dal/dalFolder')(serviceContext);

      const v1Func = jest.fn().mockRejectedValue(new Error('v1-error'));
      const v2Func = jest.fn();
      const context = mockUtil.makeContext();

      try {
        await dal.v1Tov2DalSwitch(v1Func, v2Func, context, 'org123', true);
        expect.fail('should throw error');
      } catch (err) {
        expect(err.message).toBe('v1-error');
        expect(v2Func).not.toHaveBeenCalled();
      }
    });
  });
});

describe('#getUserRootFolders', () => {
  const ctx = mockUtil.makeContext();
  it('should return empty array when organizationId is not provided', async () => {
    const result = await dal.getUserRootFolders(null, null);
    expect(result).toEqual([]);
  });

  it('should return user root folders for organization', async () => {
    serviceContext.dbConnections['media_platform'].read._push(
      [
        { root_folder_id: 'folder-1', user_id: 'user-1' },
        { root_folder_id: 'folder-2', user_id: 'user-2' }
      ],
      false,
      ['rf.user_id', 'rf.root_folder_type_id'],
      (sql, params) => {
        expect(params[0]).toEqual(3); // root folder type id for 'cms'
        return true;
      }
    );

    serviceContext.dbConnections['sso'].read._push([
      { user_id: 'user-1' },
      { user_id: 'user-2' }
    ]);

    const result = await dal.getUserRootFolders(ctx, {
      rootFolderType: 'cms',
      organizationId: 7682,
      limit: 500,
      offset: 0
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      folderId: 'folder-1',
      rootFolderUserId: 'user-1'
    });
    expect(result[1]).toEqual({
      folderId: 'folder-2',
      rootFolderUserId: 'user-2'
    });
  });

  it('should return user root folders without ACE', async () => {
    serviceContext.dbConnections['media_platform'].read._push(
      [
        { root_folder_id: 'folder-1', user_id: 'user-1' },
        { root_folder_id: 'folder-2', user_id: 'user-2' }
      ],
      false,
      ['rf.user_id', 'rf.root_folder_type_id'],
      (sql, params) => {
        expect(sql).toMatch(
          /LEFT JOIN rbac_folders _rbac_f ON _rbac_f\.folder_id = rf\.root_folder_id/
        );
        expect(sql).toMatch(/_rbac_f\.folder_id IS NULL/);
        expect(params[0]).toEqual(3); // root folder type id for 'cms'
        return true;
      }
    );

    serviceContext.dbConnections['sso'].read._push(
      [{ user_id: 'user-1' }, { user_id: 'user-2' }],
      false,
      ['sso_user__sso_group', 'sso_group'],
      (sql, params) => {
        expect(params).toEqual([['user-1', 'user-2'], '7682']);
        return true;
      }
    );

    const result = await dal.getUserRootFolders(ctx, {
      withoutACE: true,
      rootFolderType: 'cms',
      organizationId: 7682,
      limit: 500,
      offset: 0
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      folderId: 'folder-1',
      rootFolderUserId: 'user-1'
    });
    expect(result[1]).toEqual({
      folderId: 'folder-2',
      rootFolderUserId: 'user-2'
    });
  });

  it('should filter out users not in organization', async () => {
    serviceContext.dbConnections['media_platform'].read._push([
      { root_folder_id: 'folder-1', user_id: 'user-1' },
      { root_folder_id: 'folder-2', user_id: 'user-2' }
    ]);

    serviceContext.dbConnections['sso'].read._push(
      [{ user_id: 'user-1' }],
      false,
      ['sso_user__sso_group', 'sso_group'],
      (sql, params) => {
        expect(params).toEqual([['user-1', 'user-2'], '7682']);
        return true;
      }
    );

    const result = await dal.getUserRootFolders(ctx, {
      organizationId: 7682,
      limit: 500,
      offset: 0
    });

    expect(result).toHaveLength(1);
    expect(result[0].folderId).toBe('folder-1');
    expect(result[0].rootFolderUserId).toBe('user-1');
  });

  it('should return empty array when no folders found', async () => {
    serviceContext.dbConnections['media_platform'].read._push([]);

    const result = await dal.getUserRootFolders(ctx, {
      organizationId: 7682,
      limit: 500,
      offset: 0
    });

    expect(result).toEqual([]);
  });
});

describe('#_getV1ParentIdFromV2', () => {
  beforeEach(() => {
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('should return null when v2FolderId is not provided', async () => {
    const result = await dal._getV1ParentIdFromV2(
      mockUtil.makeContext(),
      null,
      'cms'
    );
    expect(result).toBeNull();
  });

  it('should return null when v2 folder is not a user root folder', async () => {
    serviceContext.dbConnections['media_platform'].read._push([
      {
        id: 'v2-folder-id',
        organizationId: 14871
      }
    ]);
    const result = await dal._getV1ParentIdFromV2(
      mockUtil.makeContext(),
      'v2-folder-id',
      'cms'
    );

    expect(result).toBeNull();
  });

  it('should return V1 folderId when v2 folder is user root folder', async () => {
    // Mock getRootFolders (V2)
    serviceContext.dal.folderV2.getRootFolders.mockResolvedValue([
      {
        id: 'v2-folder-id',
        rootFolderUserId: 'user-123',
        organizationId: 7682
      }
    ]);

    // Mock getRootFoldersV1
    serviceContext.dal.organization.getOrganization = jest
      .fn()
      .mockResolvedValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
    serviceContext.dbConnections['media_platform'].read._push([
      {
        root_folder_id: 'v1-folder-id',
        root_folder_type_id: 3,
        user_id: 'user-123',
        object_id: 'v1-folder-id',
        tree_object_type_id: 4,
        tree_object_id: 'v1-tree-object-id',
        creation_date: new Date(),
        last_updated_date: new Date(),
        order_index: 1,
        shared_with: []
      }
    ]);

    const result = await dal._getV1ParentIdFromV2(
      mockUtil.makeContext(),
      'v2-folder-id',
      'cms'
    );
    expect(result).toBe('v1-folder-id');
  });

  it('should return null when V1 user root folder not found', async () => {
    serviceContext.dal.folderV2.getRootFolders.mockResolvedValue([
      {
        id: 'v2-folder-id',
        rootFolderUserId: 'user-123',
        organizationId: 7682
      }
    ]);

    // Mock getRootFoldersV1
    serviceContext.dal.organization.getOrganization = jest
      .fn()
      .mockResolvedValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
    serviceContext.dbConnections['media_platform'].read._push([]);

    const result = await dal._getV1ParentIdFromV2(
      mockUtil.makeContext(),
      'v2-folder-id',
      'cms'
    );

    expect(result).toBeNull();
  });

  it('should handle error and return null', async () => {
    serviceContext.dal.folderV2.getRootFolders.mockRejectedValue(
      new Error('DB error')
    );

    const result = await dal._getV1ParentIdFromV2(
      mockUtil.makeContext(),
      'v2-folder-id',
      'cms'
    );

    expect(result).toBeNull();
  });
});

describe('#_getV2ParentIdFromV1', () => {
  it('should return null when v1FolderId is not provided', async () => {
    const result = await dal._getV2ParentIdFromV1(
      mockUtil.makeContext(),
      null,
      14871,
      'cms'
    );
    expect(result).toBeNull();
  });

  it('should return null when organizationId is not provided', async () => {
    const result = await dal._getV2ParentIdFromV1(
      mockUtil.makeContext(),
      'v1-folder-id',
      null,
      'cms'
    );
    expect(result).toBeNull();
  });

  it('should return null when v1 folder is not a user root folder', async () => {
    // Mock getRootFoldersV1
    serviceContext.dal.organization.getOrganization = jest
      .fn()
      .mockResolvedValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });

    serviceContext.dbConnections['media_platform'].read._push([
      {
        root_folder_id: 'v1-folder-id',
        root_folder_type_id: 3,
        organization_id: 7682,
        object_id: 'v1-folder-id',
        tree_object_type_id: 4,
        tree_object_id: 'v1-tree-object-id',
        creation_date: new Date(),
        last_updated_date: new Date(),
        order_index: 1,
        shared_with: []
      }
    ]);

    const result = await dal._getV2ParentIdFromV1(
      mockUtil.makeContext(),
      'v1-folder-id',
      14871,
      'cms'
    );

    expect(result).toBeNull();
  });

  it('should return V2 folderId when v1 folder is user root folder', async () => {
    // Mock getRootFoldersV1
    serviceContext.dal.organization.getOrganization = jest
      .fn()
      .mockResolvedValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
    serviceContext.dbConnections['media_platform'].read._push([
      {
        root_folder_id: 'v1-folder-id',
        root_folder_type_id: 3,
        user_id: 'user-123',
        object_id: 'v1-folder-id',
        tree_object_type_id: 4,
        tree_object_id: 'v1-tree-object-id',
        creation_date: new Date(),
        last_updated_date: new Date(),
        order_index: 1,
        shared_with: []
      }
    ]);

    // Mock getRootFolders (V2)
    serviceContext.dal.folderV2.getRootFolders.mockResolvedValue([
      {
        id: 'v2-folder-id',
        rootFolderUserId: 'user-123',
        organizationId: 14871
      }
    ]);

    const result = await dal._getV2ParentIdFromV1(
      mockUtil.makeContext(),
      'v1-folder-id',
      14871,
      'cms'
    );

    expect(result).toBe('v2-folder-id');
  });

  it('should return null when V2 user root folder not found', async () => {
    serviceContext.dal.organization.getOrganization = jest
      .fn()
      .mockResolvedValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
    serviceContext.dbConnections['media_platform'].read._push([
      {
        root_folder_id: 'v1-folder-id',
        root_folder_type_id: 3,
        user_id: 'user-123',
        object_id: 'v1-folder-id',
        tree_object_type_id: 4,
        tree_object_id: 'v1-tree-object-id',
        creation_date: new Date(),
        last_updated_date: new Date(),
        order_index: 1,
        shared_with: []
      }
    ]);

    // Mock getRootFolders (V2) - return empty
    serviceContext.dal.folderV2.getRootFolders.mockResolvedValue([]);

    const result = await dal._getV2ParentIdFromV1(
      mockUtil.makeContext(),
      'v1-folder-id',
      14871,
      'cms'
    );

    expect(result).toBeNull();
  });

  it('should handle error and return null', async () => {
    serviceContext.dbConnections['media_platform'].read._push([]);
    serviceContext.dal.folderV2.getRootFolders.mockRejectedValue(
      new Error('DB error')
    );

    const result = await dal._getV2ParentIdFromV1(
      mockUtil.makeContext(),
      'v1-folder-id',
      14871,
      'cms'
    );

    expect(result).toBeNull();
  });
});

describe('#getParentFoldersForObject', () => {
  beforeEach(() => {
    serviceContext.dal.organization.getOrganization = jest
      .fn()
      .mockResolvedValue({
        organizationId: 7682,
        kvp: {
          features: {
            v2FoldersEnabled: 'disabled'
          }
        }
      });
    serviceContext.bll.rbacAuth.hasPermissions = jest.fn();
  });

  it('should return empty array when V1 getTDOParentFolderId throws not_found (TDO not in any folder)', async () => {
    serviceContext.dbConnections['media_platform'].read._push([]);

    const result = await dal.getParentFoldersForObject(mockUtil.makeContext(), {
      objectId: 'non-existent-tdo-id',
      organizationId: 7682
    });

    // The fix ensures we return [] instead of throwing not_found error
    expect(result).toEqual([]);
  });

  it('should return empty array when getFolder returns null', async () => {
    serviceContext.dal.folder.getFolder = jest.fn().mockResolvedValue(null);

    // Mock getParentFolderId to return a tree_object_id
    serviceContext.dbConnections['media_platform'].read._push([
      {
        tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195'
      }
    ]);

    const result = await dal.getParentFoldersForObject(mockUtil.makeContext(), {
      objectId: 'some-tdo-id',
      organizationId: 7682
    });

    expect(result).toEqual([]);
  });

  it('should return folder wrapped in array when getFolder returns a folder', async () => {
    // Mock getFolder to return a valid folder object
    const mockFolder = {
      id: '2ace46d4-9e27-4fea-9623-75231ff21195',
      name: 'Test Folder',
      organizationId: 7682
    };
    serviceContext.dal.folder.getFolder = jest.fn().mockResolvedValue(mockFolder);

    // Mock getParentFolderId to return a tree_object_id
    serviceContext.dbConnections['media_platform'].read._push([
      {
        tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195'
      }
    ]);

    const result = await dal.getParentFoldersForObject(mockUtil.makeContext(), {
      objectId: 'filed-tdo-id',
      organizationId: 7682
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]).toEqual(mockFolder);
  });
});

describe('#getParentFolders* v2 request-scoped dedup', () => {
  const OBJECT_ID = 'tdo-abc';
  const ORG_ID = 7682;
  const V2_FOLDERS = [
    { id: 'f-child', treeObjectId: 'to-child' },
    { id: 'f-root', treeObjectId: 'to-root' }
  ];

  // These tests mutate the shared serviceContext (getOrganization mock, the
  // v2FoldersAvailable flag, folderV2 spy). Capture and restore so they don't leak
  // into later describes in this file (e.g. the MAX_DEPTH suite).
  let orig;
  beforeAll(() => {
    orig = {
      getOrganization: serviceContext.dal.organization.getOrganization,
      getParentFoldersForObject:
        serviceContext.dal.folderV2.getParentFoldersForObject,
      v2FoldersAvailable: _.get(
        serviceContext,
        'config.featureFlags.v2FoldersAvailable'
      )
    };
  });
  afterAll(() => {
    serviceContext.dal.organization.getOrganization = orig.getOrganization;
    serviceContext.dal.folderV2.getParentFoldersForObject =
      orig.getParentFoldersForObject;
    _.set(
      serviceContext,
      'config.featureFlags.v2FoldersAvailable',
      orig.v2FoldersAvailable
    );
  });

  function buildV2Dal() {
    // Sets the environment-wide half of the v2 read path. The per-org half comes from the
    // request context -- see makeV2Context below; this getOrganization mock only covers
    // the DB fallback, which the context short-circuit means these tests never reach.
    _.set(serviceContext, 'config.featureFlags.v2FoldersAvailable', true);
    serviceContext.dal.organization.getOrganization = jest
      .fn()
      .mockResolvedValue({
        organizationId: ORG_ID,
        kvp: { features: { v2FoldersEnabled: 'enabled' } }
      });
    serviceContext.dal.folderV2.getParentFoldersForObject = jest
      .fn()
      .mockResolvedValue(V2_FOLDERS);
    // isV2FoldersAvailable is read per factory call (dalFolder.js createFunction), so the
    // flag above must be set before this line, not merely before the first require.
    return require('../dal/dalFolder')(serviceContext);
  }

  // v2DalSwitch's read path fires the V1 branch in parallel on every read even when it
  // returns the V2 result (dalFolder.js v2DalSwitch, "read" section). Those V1 parent
  // lookups hit the mock DB, so queue one empty result per V1 fire: an empty result makes
  // the V1 lookup resolve to [] (getParentFolderId throws not_found, which the v2DalSwitch
  // v1Promise.catch swallows). Without this the citest FIFO mock rejects on an empty queue
  // (throwOnNoResultInQueue defaults true) and the spec fails before the real assertions.
  function pushV1Empties(n) {
    for (let i = 0; i < n; i++) {
      serviceContext.dbConnections['media_platform'].read._push([], false);
    }
  }

  // The v2 gate reads the feature KVP off the request context rather than the DB whenever
  // the context org matches the org being queried (dalFolder.js
  // _useV2FoldersEnabledFeature). makeContext() returns org 7682 -- the same as ORG_ID --
  // already carrying a kvp.features blob, so buildV2Dal's getOrganization mock is
  // short-circuited and never consulted, the gate reads 'disabled', and v2DalSwitch
  // returns the V1 result. Enable the flag on the context itself, which is also what
  // production looks like: the resolver's context org carries it.
  function makeV2Context() {
    const context = mockUtil.makeContext();
    _.set(
      context,
      '_authInfo.organization.kvp.features.v2FoldersEnabled',
      'enabled'
    );
    return context;
  }

  it('folds folders + foldersTreeObjectIds into ONE v2 lookup within a request', async () => {
    const dalV2 = buildV2Dal();
    pushV1Empties(2); // one per resolver's V1 dual-fire
    const context = makeV2Context();

    const folders = await dalV2.getParentFoldersForObject(context, {
      objectId: OBJECT_ID,
      organizationId: ORG_ID,
      objectType: 'tdo',
      useRequestCache: true
    });
    const treeObjectIds = await dalV2.getParentFoldersTreeObjectIds(context, {
      objectId: OBJECT_ID,
      organizationId: ORG_ID,
      objectType: 'tdo',
      useRequestCache: true
    });

    // Both resolvers ran, results are correct and derived from the same source...
    expect(folders).toEqual(V2_FOLDERS);
    expect(treeObjectIds).toEqual(['to-child', 'to-root']);
    // ...but the folder_path @> query ran only ONCE (the dedup).
    expect(
      serviceContext.dal.folderV2.getParentFoldersForObject
    ).toHaveBeenCalledTimes(1);
  });

  it('does NOT dedup across different requests (separate contexts)', async () => {
    const dalV2 = buildV2Dal();
    pushV1Empties(2);

    await dalV2.getParentFoldersForObject(makeV2Context(), {
      objectId: OBJECT_ID,
      organizationId: ORG_ID,
      objectType: 'tdo',
      useRequestCache: true
    });
    await dalV2.getParentFoldersTreeObjectIds(makeV2Context(), {
      objectId: OBJECT_ID,
      organizationId: ORG_ID,
      objectType: 'tdo',
      useRequestCache: true
    });

    expect(
      serviceContext.dal.folderV2.getParentFoldersForObject
    ).toHaveBeenCalledTimes(2);
  });

  it('does NOT fold across different objectType (key includes type — #4661 partition)', async () => {
    const dalV2 = buildV2Dal();
    pushV1Empties(2);
    const context = makeV2Context();

    await dalV2.getParentFoldersForObject(context, {
      objectId: OBJECT_ID,
      organizationId: ORG_ID,
      objectType: 'tdo',
      useRequestCache: true
    });
    await dalV2.getParentFoldersForObject(context, {
      objectId: OBJECT_ID,
      organizationId: ORG_ID,
      objectType: 'collection',
      useRequestCache: true
    });

    // Different objectType => different v2_folder_object partition => must NOT share a
    // cache entry, so the underlying lookup runs twice.
    expect(
      serviceContext.dal.folderV2.getParentFoldersForObject
    ).toHaveBeenCalledTimes(2);
  });

  it('does NOT fold when useRequestCache is omitted (opt-in; read-then-write callers stay uncached)', async () => {
    const dalV2 = buildV2Dal();
    pushV1Empties(2);
    const context = makeV2Context();

    // Same context + same object/org/type as the folding test, but no useRequestCache:
    // the cache must stay off so callers like fileTDOResouceInResourceFolder never serve a
    // pre-write snapshot.
    await dalV2.getParentFoldersForObject(context, {
      objectId: OBJECT_ID,
      organizationId: ORG_ID,
      objectType: 'tdo'
    });
    await dalV2.getParentFoldersTreeObjectIds(context, {
      objectId: OBJECT_ID,
      organizationId: ORG_ID,
      objectType: 'tdo'
    });

    expect(
      serviceContext.dal.folderV2.getParentFoldersForObject
    ).toHaveBeenCalledTimes(2);
  });
});

function mockForGetFolder() {
  serviceContext.dbConnections['media_platform'].read._push([
    {
      tree_folder_name: 'folder1',
      tree_folder_description: 'folder 1',
      id: '2ace46d4-9e27-4fea-9623-75231ff21195',
      type_id: 1,
      object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
      tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
      order_index: 2,
      created_date_time: new Date(),
      modified_date_time: new Date(),
      tree_object_status: 1,
      shared_with: []
    }
  ]);
  serviceContext.dbConnections['media_platform'].read._push([
    {
      type_id: 4,
      tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
      tree_object_type_id: 4,
      shared_with: [],
      parent_tree_object_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
      child_tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
      depth: 2
    }
  ]);
  serviceContext.dbConnections['media_platform'].read._push([
    {
      id: '1ace46d4-9e27-4fea-9623-75231ff21195',
      type_id: 4,
      organization_id: 7682,
      user_id: 'u123',
      shares_to: []
    }
  ]);
}
function mockV2UnfileFolderItem() {
  // Unfile object
  // getV2FolderObject
  serviceContext.dbConnections['media_platform'].read._push([
    {
      organization_id: 7682,
      object_type: 'tdo',
      object_id: '00000000-0000-0000-0000-000000000000',
      folder_id: '00000000-0000-0000-0000-000000000000'
    }
  ]);
  // getV2Folder
  serviceContext.dbConnections['media_platform'].read._push([
    {
      organization_id: 7682,
      object_type: 1,
      object_id: '---test_object_id---',
      folder_id: '00000000-0000-0000-0000-000000000000'
    }
  ]);
}

// VE-24737 row #4: MAX_DEPTH must be read from `config.folder.maxDepth` (default 5), not hardcoded.
// A fresh dal built with a custom maxDepth must surface that custom value in the depth-limit error;
// if MAX_DEPTH were hardcoded to 5 again this assertion (=== 3) would fail.
describe('dalFolder — MAX_DEPTH is config-driven (folder.maxDepth)', () => {
  it('rejects an over-deep folder with maxAllowedDepth reflecting config.folder.maxDepth, not the hardcoded default', async () => {
    _.set(serviceContext, 'config.folder.maxDepth', 3);
    const dalMaxDepth3 = require('./dalFolder.js')(serviceContext);
    const context = mockUtil.makeContext();
    try {
      // Same read-mock choreography as 'should throw error on maximum folder depth limitations.'
      serviceContext.dbConnections['media_platform'].read._push([], false, []);
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: '1ace46d4-9e27-4fea-9623-75231ff21195' }],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push(
        [{ tree_object_type_id: 1 }],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      serviceContext.dbConnections['media_platform'].read._push([{}], false);
      await dalMaxDepth3.createFolder(context, {
        input: {
          name: 'folder name',
          description: 'error',
          parentId: '1ace46d4-9e27-4fea-9623-75231ff21195'
        },
        organizationId: '1'
      });
      expect.fail('no throw');
    } catch (err) {
      expect(err.name).toBe('invalid_input');
      expect(err.message).toBe(
        'Adding the new folder would exceed maximum folder depth limitations.'
      );
      expect(err.data.maxAllowedDepth).toBe(3);
    } finally {
      delete serviceContext.config.folder;
    }
  });
});
