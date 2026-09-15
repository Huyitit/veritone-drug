const _ = require('lodash');
const rbacAuth = require('../modules/rbacAuth/index.js');
const mockUtil = globalThis.mockUtil;
const {
  initializeServiceContext
} = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext(undefined, {
  enableTransactionQuery: true
});

_.set(serviceContext, 'config.featureFlags.enableRBACFeature', true);
_.set(serviceContext, 'removedV1Folder', true);
serviceContext.dal.entityTags = {
  updateEntityTags: jest.fn(),
  getEntityIdsByTagKeys: jest.fn()
};
const dal = require('./dalFolderV2.js')(serviceContext);

function expectFunction(obj, key) {
  expect(typeof obj[key]).toEqual('function');
}

describe('dalFolderV2.js', function () {
  beforeEach(() => {
    _.set(serviceContext, 'config.featureFlags.enableRBACFeature', true);
    _.set(serviceContext, 'removedV1Folder', true);
    _.merge(serviceContext.bll, {
      rbacAuth: {
        getAuthGroups: jest.fn(),
        getAuthPermissionSets: jest.fn(),
        addACEsToResources: jest.fn(),
        addDefaultACEsToResources: jest.fn(),
        removeACEsFromResources: jest.fn()
      }
    });
    _.merge(serviceContext.dal, {
      organization: {
        getOrganization: jest.fn()
      }
    });
    _.merge(serviceContext.dal, {
      folder: {
        fileObject: jest.fn(),
        getFolder: jest.fn()
      }
    });
  });
  describe('#require', function () {
    it('should have correct function exports', function () {
      expect(typeof dal).toEqual('object');
      expect(Object.keys(dal).length).toEqual(44);
      expectFunction(dal, 'getFolderObject');
      expectFunction(dal, 'getFolder');
      expectFunction(dal, 'fileFolderItem');
      expectFunction(dal, 'fileTDO');
      expectFunction(dal, 'unfileFolderItem');
      expectFunction(dal, 'moveFolder');
      expectFunction(dal, 'moveFolders');
      expectFunction(dal, 'moveFolderItem');
      expectFunction(dal, '_validateAccess');
      expectFunction(dal, 'validateCreateFolderInput');
      expectFunction(dal, 'createFolder');
      expectFunction(dal, 'validateUpdateFolderInput');
      expectFunction(dal, 'updateFolder');
      expectFunction(dal, 'deleteFolder');
      expectFunction(dal, 'getRootFolders');
      expectFunction(dal, 'createRootFolder');
      expectFunction(dal, 'getOrCreateRootFolders');
      expectFunction(dal, 'getOrCreateRootFolder');
      expectFunction(dal, 'createFolderContentTemplate');
      expectFunction(dal, 'updateFolderContentTemplate');
      expectFunction(dal, 'deleteFolderContentTemplate');
      expectFunction(dal, 'getFolderContentTemplates');
      expectFunction(dal, 'getFolderObjects');
      expectFunction(dal, 'removeTDOFromFolders');
      expectFunction(dal, 'getParentFolder');
      expectFunction(dal, 'getParentFoldersForObject');
      expectFunction(dal, 'getSubfolders');
      expectFunction(dal, 'getParentFolders');
      expectFunction(dal, 'getFolderOverview');
      expectFunction(dal, 'getFolderSummaryDetails');
      expectFunction(dal, 'shareFolder');
      expectFunction(dal, 'getSharedFolders');
      expectFunction(dal, 'contentTemplateIdToFolderSdo');
      expectFunction(dal, '_getOrganizationId');
      expectFunction(dal, 'buildRootFolderName');
    });
  });

  describe('#getFolderObject', () => {
    it('should error if missing orgId', async () => {
      const context = mockUtil.makeContext();
      let error;
      try {
        await dal.getFolderObject(context, undefined, '---objectId---', 'tdo');
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
    });
    it('should error if missing objectId', async () => {
      const context = mockUtil.makeContext();
      let error;
      try {
        await dal.getFolderObject(context, 12345, undefined, 'tdo');
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
    });
    it('should get folder object', async () => {
      const context = mockUtil.makeContext();
      let res, error;
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 12345,
          object_type: 'tdo',
          object_id: '---object_id---',
          folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          created_by: '3ace46d4-9e27-4fea-9623-75231ff21195',
          modified_by: '3ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      try {
        res = await dal.getFolderObject(
          context,
          12345,
          '---object_id---',
          'tdo'
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeUndefined();
      expect(res).toBeDefined();
    });
  });
  describe('#getFolder', () => {
    it('should error if missing input', async () => {
      const context = mockUtil.makeContext();
      let error;
      try {
        await dal.getFolder(context);
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toEqual('Missing data in the input');
    });
    it('should error if missing folder id', async () => {
      const context = mockUtil.makeContext();
      let error;
      try {
        await dal.getFolder(context, {});
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toMatch('Invalid ID format');
    });
    it('should get folder', async () => {
      const context = mockUtil.makeContext();
      let res, error;
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          folder_type_id: 1,
          organization_id: 12345,
          name: '---folder_name---',
          description: 'Unit test folder',
          parent_folder_id: 11111,
          shared_org_read: 0,
          shared_org_write: 0,
          folder_path: '---folder_path---'
        }
      ]);
      try {
        res = await dal.getFolder(context, {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195'
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeUndefined();
      expect(res).toBeDefined();
    });

    const FOLDER_ROW = {
      id: '1ace46d4-9e27-4fea-9623-75231ff21195',
      folder_type_id: 1,
      organization_id: 99999, // different from SA's org (7682)
      name: '---folder_name---',
      description: 'Unit test folder',
      parent_folder_id: null,
      shared_org_read: 0,
      shared_org_write: 0,
      folder_path: '---folder_path---'
    };

    it('should omit org filter in SQL when caller is super admin', async () => {
      // Regression: getFolder was not passing isSuperAdmin to getFolderById,
      // causing an org-scoped WHERE clause to be added even for super admins.
      // SA org (7682) differs from folder org (99999) — without the fix the
      // query would include "AND organization_id = $2", detectable via args.length.
      const context = mockUtil.makeContext(); // default context is SA (permissionMasks includes superadmin)
      let error;
      serviceContext.dbConnections['media_platform'].read._push(
        [FOLDER_ROW],
        true,
        [],
        (_sql, args) => args.length === 1 // SA: only folderId param, no org param
      );
      try {
        await dal.getFolder(context, { id: FOLDER_ROW.id });
      } catch (err) {
        error = err;
      }
      expect(error).toBeUndefined();
    });

    it('should include org filter in SQL when caller is a regular user', async () => {
      const context = mockUtil.makeContext({ authRole: 'regularUser' });
      let error;
      serviceContext.dbConnections['media_platform'].read._push(
        [FOLDER_ROW],
        true,
        [],
        (_sql, args) => args.length === 2 // non-SA: folderId + orgId params
      );
      try {
        await dal.getFolder(context, { id: FOLDER_ROW.id });
      } catch (err) {
        error = err;
      }
      expect(error).toBeUndefined();
    });
  });

  describe('#createFolder', () => {
    it('createNewFolder', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: 'f_id'
          }
        ],
        true,
        ['insert', 'v2_folder']
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folder_id: 'f_id'
          }
        ],
        true,
        ['v2_folder_treeobject']
      );

      const res = await dal._createNewFolder(context, {
        organizationId: 1,
        folderName: 'test_folder',
        folderDescription: 'test_folder_description',
        folderId: 'folderId',
        parentFolderId: 'parent_id'
      });
      expect(res).toMatchObject({
        id: 'f_id',
        treeObjectId: 'f_id'
      });
    });
    it('createNewFolder - treeObjectId', async () => {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: 'f_id'
          }
        ],
        true,
        ['insert', 'v2_folder']
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folder_id: 'f_id'
          }
        ],
        true,
        ['v2_folder_treeobject']
      );

      const res = await dal._createNewFolder(context, {
        organizationId: 1,
        folderName: 'test_folder',
        folderDescription: 'test_folder_description',
        folderId: 'folderId',
        parentFolderId: 'parent_id',
        treeObjectId: 'tid'
      });
      expect(res).toMatchObject({
        id: 'f_id',
        treeObjectId: 'tid'
      });
    });
    it('createFolder - entityTags', async () => {
      const context = mockUtil.makeContext();
      //validateCreateFolderInput - getFolderTypes
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 2,
          name: 'watchlist'
        }
      ]);
      // validateCreateFolderInput - getFolderById
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'ae5f28eb-e10b-45df-9318-8f2b9e372d1d',
          folderTypeId: 2,
          name: 'parent-folder'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: 'f_id'
          }
        ],
        true,
        ['insert', 'v2_folder']
      );
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folder_id: 'f_id'
          }
        ],
        true,
        ['v2_folder_treeobject']
      );
      serviceContext.dal.entityTags.updateEntityTags.mockReturnValue({});

      const res = await dal.createFolder(context, {
        input: {
          name: 'test_folder',
          id: 'f_id',
          description: 'test_folder_description',
          parentId: 'ae5f28eb-e10b-45df-9318-8f2b9e372d1d',
          entityTags: [
            { tagKey: 'tag_001', tagValue: 'tag_value_001' },
            { tagKey: 'tag_002', tagValue: 'tag_value_002' }
          ]
        },
        organizationId: '1'
      });
      expect(res).toMatchObject({
        id: 'f_id',
        treeObjectId: 'f_id'
      });
      expect(
        serviceContext.dal.entityTags.updateEntityTags
      ).toHaveBeenCalledWith(
        {
          entityId: 'f_id',
          organizationId: '1',
          entityType: 'folder',
          entityTags: [
            { tagKey: 'tag_001', tagValue: 'tag_value_001' },
            { tagKey: 'tag_002', tagValue: 'tag_value_002' }
          ]
        },
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('#fileTDO', () => {    
  let context;
  beforeEach(() => {    
    context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization.kvp.features', {
        v2FoldersEnabled: 'enabled'
      });
      serviceContext.logger.error = jest.fn();
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });
    it('should throw if TDO is missing', async () => {
      serviceContext.dbConnections['core'].read._push([]);
      let error;
      try {
        await dal.fileTDO(context, {
          input: {
            tdoId: '3880000002',            
            applicationId: '1ace46d4-9e27-4fea-9623-75231ff21195',          
          } 
      })} catch(err) {
        error = err;
      }      
      expect(error).toBeDefined();
      expect(error.message).toMatch('The requested TDO was not found')
    });
    
    it('should file TDO in folder calling dal.fileFolderItem', async () => {      
      const tdoId = '3880000002';
      // getTDO
      serviceContext.dbConnections['core'].read._push([
        {
          id: tdoId,
          isPublic: true
        }
      ]);
      // getFolderObject (target folder check) — not in target folder
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderObject (global check) — not filed anywhere
      serviceContext.dbConnections['media_platform'].read._push([]);
      // get folder
      serviceContext.dbConnections['media_platform'].read._push([{
        folder_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
      }]);
      // upsert
      serviceContext.dbConnections['media_platform'].write._push([{
        folder_id: '2ace46d4-9e27-4fea-9623-75231ff21195',
      }]);
      let error;
      try {
        await dal.fileTDO(context, {
          input: {
            tdoId: tdoId,            
            applicationId: '1ace46d4-9e27-4fea-9623-75231ff21195',  
            folderId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            skipIndexing: true   
          } 
      })} catch(err) {
        error = err;
      }            
      expect(error).toBeUndefined();      
    });
  });

  describe('#fileFolderItem', () => {
    it('should return if object is filed in same folder', async () => {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization.kvp.features', {
        v2FoldersEnabled: 'enabled'
      });
      serviceContext.logger.error = jest.fn();
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // getFolderObject
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 12345,
          object_type: 'tdo',
          object_id: '---object_id---',
          folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          created_by: '3ace46d4-9e27-4fea-9623-75231ff21195',
          modified_by: '3ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      const res = await dal.fileFolderItem(
        context,
        12345,
        '1ace46d4-9e27-4fea-9623-75231ff21195',
        '---object_id---',
        'tdo'
      );

      expect(serviceContext.logger.error).not.toHaveBeenCalled();
      expect(_.get(res, 'folderId')).toEqual(
        '1ace46d4-9e27-4fea-9623-75231ff21195'
      );
    });
    it('should error if object was filed elsewhere', async () => {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization.kvp.features', {
        v2FoldersEnabled: 'enabled'
      });
      serviceContext.logger.error = jest.fn((msg) => {
        expect(msg).toEqual(
          'V2Folder: The object has already been filed elsewhere.'
        );
      });
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // getFolderObject (target folder check) — not in target folder
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderObject (global check) — filed in a different folder
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 12345,
          object_type: 'tdo',
          object_id: '---object_id---',
          folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          created_by: '3ace46d4-9e27-4fea-9623-75231ff21195',
          modified_by: '3ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      let error;
      try {
        await dal.fileFolderItem(
          context,
          12345,
          '---folder_id---',
          '---object_id---',
          'tdo'
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(serviceContext.logger.error).toHaveBeenCalled();
    });
    it('should throw NotFound if folder does not exist', async () => {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization.kvp.features', {
        v2FoldersEnabled: 'enabled'
      });
      serviceContext.logger.error = jest.fn();
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // getFolderObject (target folder check) — not in target folder
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderObject (global check) — not filed anywhere
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderById (V2 id lookup) — not found, triggers treeObjectId fallback
      serviceContext.dbConnections['media_platform'].read._push(
        new Error('folder not found')
      );
      // getFolderByTreeObjectId fallback — also not found
      serviceContext.dbConnections['media_platform'].read._push(
        new Error('folder not found by treeObjectId')
      );
      let error;
      try {
        await dal.fileFolderItem(
          context,
          12345,
          '---folder_id---',
          '---object_id---',
          'tdo'
        );
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.name).toBe('not_found');
    });
    it('should resolve V1 treeObjectId as folderId', async () => {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization.kvp.features', {
        v2FoldersEnabled: 'enabled'
      });
      serviceContext.logger.error = jest.fn();
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // getFolderObject (target folder check) — not in target folder
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderObject (global check) — not filed anywhere
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderById: V2 uuid lookup fails (it's a treeObjectId, not a folder uuid)
      serviceContext.dbConnections['media_platform'].read._push(
        new Error('not a valid folder uuid')
      );
      // getFolderByTreeObjectId: resolved successfully (parse=false: ANY() clause not supported by mock parser)
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            folder_type_id: 1,
            organization_id: 12345,
            folder_name: '---folder_name---',
            parent_folder_id: 11111
          }
        ],
        false
      );
      // INSERT ran successfully
      serviceContext.dbConnections['media_platform'].write._push([
        {
          organization_id: 12345,
          object_type: 'tdo',
          object_id: '---object_id---',
          folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          created_by: '3ace46d4-9e27-4fea-9623-75231ff21195',
          modified_by: '3ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      const res = await dal.fileFolderItem(
        context,
        12345,
        '---tree_object_id---',
        '---object_id---',
        'tdo'
      );
      expect(serviceContext.logger.error).not.toHaveBeenCalled();
      expect(res).toBeDefined();
    });
    it('should return inserted object successfully', async () => {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization.kvp.features', {
        v2FoldersEnabled: 'enabled'
      });
      serviceContext.logger.error = jest.fn();
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // getFolderObject (target folder check) — not in target folder
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderObject (global check) — not filed anywhere
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolder (via _validateFolderId)
      serviceContext.dbConnections['media_platform'].read._push([
        {
          folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          folder_type_id: 1,
          organization_id: 12345,
          folder_name: '---folder_name---',
          folder_description: 'Unit test folder',
          parent_folder_id: 11111,
          shared_org_read: 0,
          shared_org_write: 0,
          folder_path: '---folder_path---'
        }
      ]);
      // INSERT ran successfully
      serviceContext.dbConnections['media_platform'].write._push([
        {
          organization_id: 12345,
          object_type: 'tdo',
          object_id: '---object_id---',
          folder_id: '---folder_id---',
          created_by: '3ace46d4-9e27-4fea-9623-75231ff21195',
          modified_by: '3ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      const res = await dal.fileFolderItem(
        context,
        12345,
        '---folder_id---',
        '---object_id---',
        'tdo'
      );

      expect(serviceContext.logger.error).not.toHaveBeenCalled();
      expect(res).toBeDefined();
    });
    it('should allow file in multiple parents if object was filed elsewhere', async () => {
      const context = mockUtil.makeContext();
      serviceContext.logger.error = jest.fn();
      _.set(context, '_authInfo.organization.kvp.features', {
        v2FoldersEnabled: 'enabled'
      });
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // getFolderObject (target folder check) — not already in target folder
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolder (via _validateFolderId — allowMultipleParents skips global conflict check)
      serviceContext.dbConnections['media_platform'].read._push([
        {
          folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          folder_type_id: 1,
          organization_id: 12345,
          folder_name: '---folder_name---',
          folder_description: 'Unit test folder',
          parent_folder_id: 11111,
          shared_org_read: 0,
          shared_org_write: 0,
          folder_path: '---folder_path---'
        }
      ]);
      // Insert query ran successfully
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organization_id: 12345,
            object_type: 'tdo',
            object_id: '---object_id---',
            folder_id: '---folder_id---',
            created_by: '3ace46d4-9e27-4fea-9623-75231ff21195',
            modified_by: '3ace46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        false,
        ['AND folder_id =']
      );
      const res = await dal.fileFolderItem(
        context,
        12345,
        '---folder_id---',
        '---object_id---',
        'tdo',
        true
      );
      expect(serviceContext.logger.error).not.toHaveBeenCalled();
      expect(res).toBeDefined();
    });
  });
  describe('#unfileFolderItem', () => {
    it('should error if folder object was not filed anywhere', async () => {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization.kvp.features', {
        v2FoldersEnabled: 'enabled'
      });
      serviceContext.logger.error = jest.fn((msg) => {
        expect(msg).toEqual(
          `V2Folder: Object not found. objectType = "tdo", objectId = "---object_id---", folderId = "---folder_id---"`
        );
      });
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // getFolderObject
      serviceContext.dbConnections['media_platform'].read._push([]);
      await dal.unfileFolderItem(
        context,
        12345,
        '---folder_id---',
        '---object_id---',
        'tdo'
      );

      expect(serviceContext.logger.error).toHaveBeenCalled();
    });
    it('should error if folder object was not filed in the given folderId', async () => {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.organization.kvp.features', {
        v2FoldersEnabled: 'enabled'
      });
      serviceContext.logger.error = jest.fn((msg) => {
        expect(msg).toEqual(`Object was filed, but in different folder`);
      });
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        kvp: {
          features: {
            v2FoldersEnabled: 'enabled'
          }
        }
      });
      // getFolderObject
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 12345,
          object_type: 'tdo',
          object_id: '---object_id---',
          folder_id: '---folder_id_1---',
          created_by: '3ace46d4-9e27-4fea-9623-75231ff21195',
          modified_by: '3ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([
        { id: '---folder_id_2---' }
      ]);
      await dal.unfileFolderItem(
        context,
        12345,
        '---folder_id---',
        '---object_id---',
        'tdo'
      );

      expect(serviceContext.logger.error).toHaveBeenCalled();
    });
    it('should delete folder object', async () => {
      const context = mockUtil.makeContext();
      // getFolderObject
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 12345,
          object_type: 'tdo',
          object_id: '---object_id---',
          folder_id: '---folder_id---',
          created_by: '3ace46d4-9e27-4fea-9623-75231ff21195',
          modified_by: '3ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      // _validateFolderId
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '---folder_id---'
        }
      ]);
      // Delete object successfully
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 12345,
          object_type: 'tdo',
          object_id: '---object_id---',
          folder_id: '---folder_id---'
        }
      ]);
      const res = await dal.unfileFolderItem(
        context,
        12345,
        '---folder_id---',
        '---object_id---',
        'tdo'
      );

      expect(res).toBeDefined();
    });
  });
  describe('#moveFolder', function () {
    it('should throw organizationId is required', async function () {
      try {
        await dal.moveFolder(mockUtil.makeContext(), {
          input: {}
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual('organizationId is required');
      }
    });
    it('should throw invalid input', async function () {
      try {
        await dal.moveFolder(mockUtil.makeContext(), {
          input: {
            organizationId: 7682
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should return invalid access if the new parent folder does not belong to the organization', async function () {
      try {
        // mockForValidateFolderId
        mockForValidateFolderId('folder_id');

        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              id: 1,
              name: 'cms'
            }
          ],
          false
        );
        serviceContext.dbConnections['media_platform'].read._push([], false);
        await dal.moveFolder(mockUtil.makeContext(), {
          organizationId: '1',
          input: {
            organizationId: '1',
            folderId: 'folder_id',
            newParentFolderId: 'new_parent_folder_id'
          }
        });
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toEqual('Unable to authorize access to folder');
      }
    });
    it('should move folder', async function () {
      // mockForValidateFolderId
      mockForValidateFolderId('folder_id');
      // _validateAccess
      mockForValidateAccess(2, ['folderType']);
      // update folder_path
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          folder_type_id: 1,
          organization_id: 12345,
          name: '---folder_name---',
          description: 'Unit test folder',
          parent_folder_id: 11111,
          shared_org_read: 0,
          shared_org_write: 0,
          folder_path: '---folder_path---'
        }
      ]);
      const context = mockUtil.makeContext();
      try {
        const res = await dal.moveFolder(context, {
          organizationId: 1,
          input: {
            organizationId: 1,
            folderId: '0c4c2765-1817-40a7-bd6d-bf6362a384ba',
            newParentFolderId: '22d2c53a-d33e-47d8-a77e-f64f5c3db7c8',
            rootFolderType: 'folderType'
          }
        });
        expect(res).toBeDefined();
      } catch (err) {
        expect(err).toBeUndefined();
      }
    });
    it('should return resource_conflict when try to move parent folder to its child', async function () {
      // mockForValidateFolderId
      mockForValidateFolderId('parent_folder_id');
      // _validateAccess
      mockForValidateAccess(2, ['folderType']);
      // return getFolderById in getParentFolders
      serviceContext.dbConnections['media_platform'].read._push([
        {
          folderId: 'child_folder_id',
          folder_path: 'parent_folder_id.child_folder_id',
          parentFolderId: 'parent_folder_id'
        }
      ]);
      // return getParentFolders
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'parent_folder_id',
          folder_path: 'parent_folder_id'
        }
      ]);

      let error, res;
      const context = mockUtil.makeContext();
      try {
        res = await dal.moveFolder(context, {
          organizationId: 1,
          input: {
            organizationId: 1,
            folderId: 'parent_folder_id',
            newParentFolderId: 'child_folder_id',
            rootFolderType: 'folderType'
          }
        });
      } catch (err) {
        error = err;
      }
      expect(res).toBeUndefined();
      expect(error).toBeDefined();
      expect(error.message).toContain('Cannot move parent folder into its own subfolder');
    });
  });
  describe('#moveFolders', function () {
    it('should throw organizationId is required', async function () {
      try {
        await dal.moveFolder(mockUtil.makeContext(), {
          input: {}
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual('organizationId is required');
      }
    });
    it('should throw invalid input', async function () {
      try {
        await dal.moveFolder(mockUtil.makeContext(), {
          input: {
            organizationId: 7682
          }
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should return invalid access if the new parent folder does not belong to the organization', async function () {
      try {
        // mockForValidateFolderId
        mockForValidateFolderId('folder_id');
        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              id: 1,
              name: 'cms'
            }
          ],
          false
        );
        serviceContext.dbConnections['media_platform'].read._push([], false);
        await dal.moveFolder(mockUtil.makeContext(), {
          organizationId: '1',
          input: {
            organizationId: '1',
            folderId: 'folder_id',
            newParentFolderId: 'new_parent_folder_id'
          }
        });
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toEqual('Unable to authorize access to folder');
      }
    });
    it('should move valid folders to the new parent and return invalid folders', async function () {
      // _validateAccess
      mockForValidateAccess(4, ['folderType']);
      // update folder_path
      serviceContext.dbConnections['media_platform'].read._push([], false);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'folder_1'
          },
          {
            id: 'folder_2'
          },
          {
            id: 'folder_2_1',
            desciptions: 'child of folder_2'
          }
        ],
        false
      );

      const context = mockUtil.makeContext();
      const res = await dal.moveFolders(context, {
        organizationId: 1,
        input: {
          organizationId: 1,
          folderIds: ['folder_1', 'folder_2', 'folder_3'],
          newParentFolderId: 'parent_folder_id',
          rootFolderType: 'folderType'
        }
      });
      expect(res).toEqual(
        expect.objectContaining({
          organizationId: 1,
          newParentFolderId: 'parent_folder_id',
          validFolderIds: ['folder_1', 'folder_2'],
          invalidFolderIds: ['folder_3'],
          message: expect.any(String)
        })
      );
    });
  });
  describe('#moveFolderItem', function () {
    it('should throw organizationId is required', async function () {
      try {
        await dal.moveFolderItem(mockUtil.makeContext(), {
          input: {}
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual('organizationId is required.');
      }
    });
    it('should throw invalid input', async function () {
      try {
        await dal.moveFolderItem(mockUtil.makeContext(), {
          organizationId: 7682,
          input: {}
        });
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
      }
    });
    it('should file object in new folder if it was not filed at all', async function () {
      // getFolderObject in moveFolderItem fn
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // getFolderObject (target folder check) in fileFolderItem — not in target folder
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderObject (global check) in fileFolderItem — not filed anywhere
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolder
      serviceContext.dbConnections['media_platform'].read._push([
        {
          folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          folder_type_id: 1,
          organization_id: 12345,
          folder_name: '---folder_name---',
          folder_description: 'Unit test folder',
          parent_folder_id: 11111,
          shared_org_read: 0,
          shared_org_write: 0,
          folder_path: '---folder_path---'
        }
      ]);
      // Insert query ran successfully
      serviceContext.dbConnections['media_platform'].read._push([
        {
          organization_id: 12345,
          object_type: 'tdo',
          object_id: '---object_id---',
          folder_id: '---folder_id---',
          created_by: '3ace46d4-9e27-4fea-9623-75231ff21195',
          modified_by: '3ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);
      let err;
      try {
        await dal.moveFolderItem(mockUtil.makeContext(), {
          organizationId: '1',
          input: {
            objectId: 'tdoId',
            objectType: 'tdo',
            newFolderId: 'new_folder_id'
          }
        });
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
    });
    it('should move object in new folder', async function () {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folder_id: 'folder_id'
          }
        ],
        false
      );
      // update parent_folder_id for object
      serviceContext.dbConnections['media_platform'].read._push([], false);

      const context = mockUtil.makeContext();
      let err;
      try {
        await dal.moveFolderItem(context, {
          organizationId: 1,
          input: {
            objectId: 'tdoId',
            objectType: 'tdo',
            newFolderId: 'new_folder_id'
          }
        });
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
    });
  });
  describe('#_validateAccess', function () {
    it('should throw missing options object', async function () {
      try {
        await dal._validateAccess();
      } catch (err) {
        expect(err.message).toEqual('Missing options object');
      }
    });
    it('should throw missing organizationId', async function () {
      try {
        await dal._validateAccess({});
      } catch (err) {
        expect(err.message).toEqual('Missing organizationId');
      }
    });
    it('should throw missing userId', async function () {
      try {
        await dal._validateAccess({
          organizationId: '7682'
        });
      } catch (err) {
        expect(err.message).toEqual('Missing userId');
      }
    });
    it('should throw missing folderIds', async function () {
      try {
        await dal._validateAccess({
          organizationId: '7682',
          userId: '1'
        });
      } catch (err) {
        expect(err.message).toEqual('Missing folderIds');
      }
    });
    it('should throw invalid root folder type', async function () {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 1,
            name: 'folderType'
          }
        ],
        false
      );
      try {
        await dal._validateAccess({
          organizationId: '7682',
          userId: '1',
          folderIds: ['folder_id'],
          rootFolderType: 'otherType'
        });
      } catch (err) {
        expect(err.message).toEqual('Invalid root folder type');
      }
    });
    it('should return validate access', async function () {
      mockForValidateAccess(1, ['cms']);
      let err;
      try {
        await dal._validateAccess({
          organizationId: 1,
          userId: 'user_id',
          folderIds: ['folder_id']
        });
      } catch (error) {
        err = error;
      }

      expect(err).toBeUndefined();
    });
  });
  describe('#validateCreateFolderInput', function () {
    it('should throw error on missing input', async function () {
      const context = mockUtil.makeContext();
      try {
        await dal.validateCreateFolderInput(context, {
          input: null
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual('Missing data in the input');
      }
    });
    it('should throw error if the folder name is inavlid 1', async function () {
      const context = mockUtil.makeContext();
      try {
        await dal.validateCreateFolderInput(context, {
          input: {
            name: '  '
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual('the name field is required.');
      }
    });
    it('should throw error if the folder name is inavlid 2', async function () {
      const context = mockUtil.makeContext();
      try {
        await dal.validateCreateFolderInput(context, {
          input: {
            name: null
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual('the name field is required.');
      }
    });
    it('should throw error on folder types not found', async function () {
      const context = mockUtil.makeContext();
      try {
        // Not found folder types
        serviceContext.dbConnections['media_platform'].read._push([], false);
        await dal.validateCreateFolderInput(context, {
          input: {
            name: 'folder-name',
            parentId: 'invalid_input'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
        expect(err.message).toEqual('No folderTypes found');
      }
    });
    it('should throw error on invalid input parentId', async function () {
      const context = mockUtil.makeContext();
      try {
        // Folder types
        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              folderTypeId: 1,
              folderTypeName: 'folder',
              folderTypeImage: '',
              folderTypeDescription: 'Folder desc',
              contentTemplateSchemaId: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
              organizationId: 1
            }
          ],
          false
        );
        await dal.validateCreateFolderInput(context, {
          input: {
            name: 'folder-name',
            parentId: 'invalid_input'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual('The specified parent ID is invalid');
      }
    });
    it('should throw error if parent folder not found', async function () {
      const context = mockUtil.makeContext();
      try {
        // Folder types
        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              folderTypeId: 1,
              folderTypeName: 'folder',
              folderTypeImage: '',
              folderTypeDescription: 'Folder desc',
              contentTemplateSchemaId: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
              organizationId: 1
            }
          ],
          false
        );
        // Get folder by id (main query)
        serviceContext.dbConnections['media_platform'].read._push([], false);
        // Get folder by id (treeObjectId fallback)
        serviceContext.dbConnections['media_platform'].read._push([], false);
        await dal.validateCreateFolderInput(context, {
          input: {
            name: 'folder name',
            description: 'folder description',
            parentId: '1ace46d4-9e27-4fea-9623-75231ff21195'
          },
          organizationId: 1
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
        expect(err.message).toContain('Parent folder not found');
      }
    });
    it('should update typeId if it does not pass in and the parent is not a root', async function () {
      const context = mockUtil.makeContext();
      try {
        // Folder types
        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              folderTypeId: 1,
              folderTypeName: 'folder',
              folderTypeImage: '',
              folderTypeDescription: 'Folder type desc',
              contentTemplateSchemaId: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
              organizationId: 1
            },
            {
              folderTypeId: 2,
              folderTypeName: 'folder type 2',
              folderTypeImage: '',
              folderTypeDescription: 'Folder type desc',
              contentTemplateSchemaId: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
              organizationId: 1
            }
          ],
          false
        );
        // Get parent folder by id
        const parent = {
          folderId: '1ace46d4-9e27-4fea-9623-75231ff21195',
          folderName: 'parent folder name',
          description: 'description',
          folderTypeId: 2,
          parentFolderId: undefined // root
        };
        serviceContext.dbConnections['media_platform'].read._push(
          [parent],
          false
        );
        const result = await dal.validateCreateFolderInput(context, {
          input: {
            name: 'folder name',
            description: 'folder description',
            parentId: '1ace46d4-9e27-4fea-9623-75231ff21195',
            typeId: undefined
          },
          organizationId: 1
        });
        expect(result.folderTypeId).not.toEqual(parent.folderTypeId);
      } catch (err) {
        expect(err).toUndefined;
      }
    });
    it('should create v2_folder input success', async function () {
      const context = mockUtil.makeContext();
      // Folder types
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 1,
            name: 'folder',
            image: '',
            description: 'Folder desc',
            contentTemplateSchemaId: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
            organizationId: 1
          }
        ],
        false
      );
      // Get parent
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            name: 'parent-folder-1',
            typeId: 1
          }
        ],
        false
      );
      // Insert into
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folderId: '57600f00-8152-4d12-8d48-8a7364dde01f',
            folderName: 'folder name',
            description: 'success',
            typeId: 1
          }
        ],
        false
      );
      const res = await dal.validateCreateFolderInput(context, {
        input: {
          id: '57600f00-8152-4d12-8d48-8a7364dde01f',
          name: 'folder name',
          description: 'success',
          parentId: '1ace46d4-9e27-4fea-9623-75231ff21195',
          typeId: 1
        },
        organizationId: '1'
      });
      expect(res).toBeDefined;
      expect(res.folderId).toEqual('57600f00-8152-4d12-8d48-8a7364dde01f');
      expect(res.folderName).toEqual('folder name');
      expect(res.folderDescription).toEqual('success');
    });
    it('should use output from v1 folder', async function () {
      const context = mockUtil.makeContext();
      // Folder types
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 1,
            name: 'folder',
            image: '',
            description: 'Folder desc',
            contentTemplateSchemaId: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
            organizationId: 1
          }
        ],
        false
      );
      // Get parent
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            name: 'parent-folder-1',
            typeId: 1
          }
        ],
        false
      );
      // Insert into
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folderId: '57600f00-8152-4d12-8d48-8a7364dde01f',
            folderName: 'folder name',
            description: 'success',
            typeId: 1
          }
        ],
        false
      );
      const res = await dal.validateCreateFolderInput(context, {
        input: {
          id: '57600f00-8152-4d12-8d48-8a7364dde01f',
          name: 'folder name',
          description: 'success',
          parentId: '1ace46d4-9e27-4fea-9623-75231ff21195',
          typeId: 1
        },
        v1Output: {
          treeFolderId: '12ab1837-c55f-45cf-b2a4-71cb7dc84b01',
          folderName: 'folder name - v1',
          folderDescription: 'folder desc - v1'
        },
        organizationId: '1'
      });
      expect(res).toBeDefined;
      expect(res.folderId).toEqual('12ab1837-c55f-45cf-b2a4-71cb7dc84b01');
      expect(res.folderName).toEqual('folder name - v1');
      expect(res.folderDescription).toEqual('folder desc - v1');
    });

    describe('Super Admin folder creation', function () {
      it('should allow Super Admin to create folder under parent owned by different org', async function () {
        const context = mockUtil.makeContext();
        // Set up Super Admin rights
        _.set(context, '_authInfo.json.rights', ['superadmin']);
        _.set(context, '_authInfo.organization.organizationId', 7682);

        const parentOrgId = 52883;
        const parentFolderId = '0c770644-0dfc-4886-ba92-269d5d3bd2bc';

        // Folder types
        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              id: 1,
              name: 'folder',
              image: '',
              description: 'Folder desc',
              contentTemplateSchemaId: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
              organizationId: 1
            }
          ],
          false
        );

        // Get parent folder - owned by different org (52883)
        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              id: parentFolderId,
              name: 'parent-folder-org-52883',
              typeId: 1,
              organizationId: parentOrgId,
              parentFolderId: 'root-folder-id'
            }
          ],
          false
        );

        const res = await dal.validateCreateFolderInput(context, {
          input: {
            id: '57600f00-8152-4d12-8d48-8a7364dde01f',
            name: 'new subfolder',
            description: 'created by super admin',
            parentId: parentFolderId,
            typeId: 1
          },
          organizationId: 7682 // Super Admin's current org
        });

        expect(res).toBeDefined();
        expect(res.folderId).toEqual('57600f00-8152-4d12-8d48-8a7364dde01f');
        expect(res.folderName).toEqual('new subfolder');
        // The new folder should inherit the parent's organizationId
        expect(res.organizationId).toEqual(parentOrgId);
      });

      it('should inherit parent folder organizationId for Super Admin', async function () {
        const context = mockUtil.makeContext();
        // Set up Super Admin rights
        _.set(context, '_authInfo.json.rights', ['superadmin']);
        _.set(context, '_authInfo.organization.organizationId', 7682);

        const parentOrgId = 12345; // Different org
        const parentFolderId = 'aaaa1111-2222-3333-4444-555566667777';

        // Folder types
        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              id: 1,
              name: 'folder',
              image: '',
              description: 'Folder desc',
              contentTemplateSchemaId: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
              organizationId: 1
            }
          ],
          false
        );

        // Get parent folder - owned by org 12345
        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              id: parentFolderId,
              name: 'parent-folder',
              typeId: 1,
              organizationId: parentOrgId,
              parentFolderId: 'some-root-folder-id'
            }
          ],
          false
        );

        const res = await dal.validateCreateFolderInput(context, {
          input: {
            name: 'subfolder by superadmin',
            description: 'test',
            parentId: parentFolderId
          },
          organizationId: 7682
        });

        expect(res).toBeDefined();
        // Verify organizationId is inherited from parent, not from Super Admin's context
        expect(res.organizationId).toEqual(parentOrgId);
        expect(res.organizationId).not.toEqual(7682);
      });

      it('should use requestor org when non-Super Admin creates folder', async function () {
        const context = mockUtil.makeContext();
        // Regular user (no superadmin rights)
        _.set(context, '_authInfo.json.rights', []);
        _.set(context, '_authInfo.organization.organizationId', 7682);

        const parentFolderId = 'bbbb1111-2222-3333-4444-555566667777';

        // Folder types
        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              id: 1,
              name: 'folder',
              image: '',
              description: 'Folder desc',
              contentTemplateSchemaId: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
              organizationId: 1
            }
          ],
          false
        );

        // Get parent folder - same org as user
        serviceContext.dbConnections['media_platform'].read._push(
          [
            {
              id: parentFolderId,
              name: 'parent-folder',
              typeId: 1,
              organizationId: 7682,
              parentFolderId: 'some-root-folder-id'
            }
          ],
          false
        );

        const res = await dal.validateCreateFolderInput(context, {
          input: {
            name: 'subfolder by regular user',
            description: 'test',
            parentId: parentFolderId
          },
          organizationId: 7682
        });

        expect(res).toBeDefined();
        // For regular users, organizationId comes from args/context
        expect(res.organizationId).toEqual(7682);
      });
    });
  });
  describe('#validateUpdateFolderInput', function () {
    it('should throw error on invalid input.id', async function () {
      const context = mockUtil.makeContext();
      try {
        await dal.validateUpdateFolderInput(context, {
          input: {
            id: 'invalid'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toContain('Invalid ID format');
      }
    });
    it('should throw error if the folder name is inavlid 1', async function () {
      const context = mockUtil.makeContext();
      try {
        await dal.validateUpdateFolderInput(context, {
          input: {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            name: '  '
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual('the name field is required.');
      }
    });
    it('should throw error if the folder name is inavlid 2', async function () {
      const context = mockUtil.makeContext();
      try {
        await dal.validateUpdateFolderInput(context, {
          input: {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            name: null
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toEqual('the name field is required.');
      }
    });
    it('should throw error on folder not found', async function () {
      const context = mockUtil.makeContext();
      // Folder types (main query)
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // Folder types (treeObjectId fallback)
      serviceContext.dbConnections['media_platform'].read._push([], false);
      try {
        await dal.validateUpdateFolderInput(context, {
          input: {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            name: 'folder-name'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
        expect(err.message).toContain('The folder was not found');
      }
    });
  });
  describe('#updateFolder', () => {
    it('should return update folder with entityTags', async () => {
      // validateUpdateFolderInput - getFolderById
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          folderTypeId: 2,
          name: 'folder'
        }
      ]);
      // _updateFolder - getFolderById
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          folderTypeId: 2,
          name: 'folder',
          organizationId: 7682
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: '2ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682
          }
        ],
        false,
        ['UPDATE', 'v2_folder'],
        (sql, params) => {
          expect(params[0]).toEqual('updated folder name');
          expect(params[1]).toEqual('2ace46d4-9e27-4fea-9623-75231ff21195');
          expect(params[2]).toEqual(7682);
          return true;
        }
      );
      serviceContext.dal.entityTags.updateEntityTags.mockReturnValue({});
      const context = mockUtil.makeContext();
      const res = await dal.updateFolder(context, {
        input: {
          id: '2ace46d4-9e27-4fea-9623-75231ff21195',
          name: 'updated folder name',
          entityTags: [
            { tagKey: 'tag_001', tagValue: 'tag_value_001' },
            { tagKey: 'tag_002', tagValue: 'tag_value_002' }
          ]
        }
      });
      expect(res).toBeDefined();
      expect(
        serviceContext.dal.entityTags.updateEntityTags
      ).toHaveBeenCalledWith(
        {
          entityId: '2ace46d4-9e27-4fea-9623-75231ff21195',
          organizationId: 7682,
          entityType: 'folder',
          entityTags: [
            { tagKey: 'tag_001', tagValue: 'tag_value_001' },
            { tagKey: 'tag_002', tagValue: 'tag_value_002' }
          ]
        },
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('#deleteFolder', function () {
    let context;
    beforeEach(() => {
      context = mockUtil.makeContext();
      serviceContext.logger.error = jest.fn();
    });

    it('should throw error on invalid input.id', async function () {
      try {
        await dal.deleteFolder(context, {
          input: {
            id: 'invalid'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toContain('Invalid ID format');
      }
    });
    it('should throw error on folder not found', async function () {
      const context = mockUtil.makeContext();
      // get folder
      serviceContext.dbConnections['media_platform'].read._push([], false);
      try {
        await dal.deleteFolder(context, {
          input: {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_found');
        expect(err.message).toEqual('The folder was not found');
      }
    });
    it('should throw error on if we have childen folders in the folder', async function () {
      const context = mockUtil.makeContext();
      // get folder
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            name: 'folder_name',
            parentFolderId: 'parent_folder_id'
          }
        ],
        false
      );
      // _userHasV2FolderAccess — user has access
      serviceContext.dbConnections['media_platform'].read._push([{ '?column?': 1 }], false);
      // get childen folders
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            name: 'child_folder_name_1'
          },
          {
            id: 'c90ae112-2bf9-4ac6-b911-af7082efc672',
            name: 'child_folder_name_2'
          }
        ],
        false
      );
      try {
        await dal.deleteFolder(context, {
          input: {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toContain('Folder is not empty');
      }
    });
    it('should throw error on if we have folder objects in the folder', async function () {
      const context = mockUtil.makeContext();
      // get folder
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            name: 'folder_name',
            parentFolderId: 'parent_folder_id'
          }
        ],
        false
      );
      // _userHasV2FolderAccess — user has access
      serviceContext.dbConnections['media_platform'].read._push([{ '?column?': 1 }], false);
      // get childen folders
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // get folder objects
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            organizationId: 1,
            folderId: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            objectId: 'object_id_1',
            objectType: 'type1'
          },
          {
            organizationId: 1,
            folderId: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            objectId: 'object_id_2',
            objectType: 'type2'
          }
        ],
        false
      );
      try {
        await dal.deleteFolder(context, {
          input: {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toContain(
          'Must delete all objects in the folder before deleting it'
        );
      }
    });
    it('should throw error on if we have folder SDO in the folder', async function () {
      const context = mockUtil.makeContext();
      // get folder
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            name: 'folder_name',
            parentFolderId: 'parent_folder_id'
          }
        ],
        false
      );
      // _userHasV2FolderAccess — user has access
      serviceContext.dbConnections['media_platform'].read._push([{ '?column?': 1 }], false);
      // get childen folders
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // get folder objects
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // get folder SDO
      // get folder SDO > mockForValidateFolderId
      mockForValidateFolderId('b90ae112-2bf9-4ac6-b911-af7082efc671');
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folderId: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            sdoId: 'sdo_id_1',
            contentTemplateSchemaId: 'SchemaId_1',
            templateId: 'template_id_1'
          },
          {
            folderId: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            sdoId: 'sdo_id_2',
            contentTemplateSchemaId: 'SchemaId_2',
            templateId: 'template_id_2'
          }
        ],
        false
      );
      try {
        await dal.deleteFolder(context, {
          input: {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('not_allowed');
        expect(err.message).toContain('Folder has linked content templates');
      }
    });
    it('should delete folder', async function () {
      const context = mockUtil.makeContext();
      // get folder
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            name: 'folder_name',
            parentFolderId: 'parent_folder_id'
          }
        ],
        false
      );
      // _userHasV2FolderAccess — user has access
      serviceContext.dbConnections['media_platform'].read._push([{ '?column?': 1 }], false);
      // get children folders
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // get folder objects
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // getFolderContentTemplates
      mockForValidateFolderId('b90ae112-2bf9-4ac6-b911-af7082efc671');
      serviceContext.dbConnections['media_platform'].read._push([], false);

      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            organizationId: 7682
          }
        ],
        false,
        ['DELETE', 'v2_folder'],
        (sql, params) => {
          expect(params[0]).toEqual('b90ae112-2bf9-4ac6-b911-af7082efc671');
          expect(params[1]).toEqual(7682);
          return true;
        }
      );
      serviceContext.dal.entityTags.updateEntityTags.mockReturnValue({});
      await dal.deleteFolder(context, {
        input: {
          id: 'b90ae112-2bf9-4ac6-b911-af7082efc671'
        }
      });
      expect(
        serviceContext.dal.entityTags.updateEntityTags
      ).toHaveBeenCalledWith(
        {
          entityId: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
          organizationId: 7682,
          entityType: 'folder',
          entityTags: []
        },
        expect.any(Object),
        expect.any(Object)
      );
    });
    it('should use folder-level org lookup when auth org does not match folder org', async function () {
      const context = mockUtil.makeContext(); // auth org = 7682 (Veritone, Inc.)
      const FOLDER_ID = 'b90ae112-2bf9-4ac6-b911-af7082efc671';
      const FOLDER_ORG = 1234; // folder belongs to a different org than the auth org

      // 1. getFolderById with auth org (7682) — primary query fails (folder not in auth org)
      serviceContext.dbConnections['media_platform'].read._push(
        [], false, [], null, true
      );
      // 2. getFolderByTreeObjectId fallback also fails — getFolderById throws not_found
      serviceContext.dbConnections['media_platform'].read._push(
        [], false, [], null, true
      );
      // 3. _getFolderOrgById lookup — returns folder's actual org
      serviceContext.dbConnections['media_platform'].read._push(
        [{ organization_id: FOLDER_ORG }],
        false
      );
      // 4. Retry getFolderById with correct org (FOLDER_ORG) — succeeds
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: FOLDER_ID, name: 'folder_name', parentFolderId: 'parent_folder_id', organizationId: FOLDER_ORG }],
        false
      );
      // 5. _userHasV2FolderAccess — user owns the root folder tree containing this folder
      serviceContext.dbConnections['media_platform'].read._push([{ '?column?': 1 }], false);
      // 6. _getFolders — no children
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // 7. getFolderObjects — no objects
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // 8. getFolderContentTemplates -> _validateFolderId -> getFolderById
      mockForValidateFolderId(FOLDER_ID);
      // 9. getFolderContentTemplates SDO query — no SDOs
      serviceContext.dbConnections['media_platform'].read._push([], false);

      // Write: _deleteFolder must use FOLDER_ORG (not auth org 7682)
      serviceContext.dbConnections['media_platform'].write._push(
        [{ id: FOLDER_ID, organizationId: FOLDER_ORG }],
        false,
        ['DELETE', 'v2_folder'],
        (sql, params) => {
          expect(params[0]).toEqual(FOLDER_ID);
          expect(params[1]).toEqual(FOLDER_ORG);
          return true;
        }
      );
      serviceContext.dal.entityTags.updateEntityTags.mockReturnValue({});

      await dal.deleteFolder(context, {
        input: { id: FOLDER_ID }
      });

      expect(serviceContext.dal.entityTags.updateEntityTags).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: FOLDER_ORG }),
        expect.any(Object),
        expect.any(Object)
      );
    });
    it('should reject cross-org delete when user has no access to the folder in its org', async function () {
      const context = mockUtil.makeContext(); // auth org = 7682
      const FOLDER_ID = 'c81be112-3cf9-4ac6-b911-af7082efc672';
      const FOLDER_ORG = 9999; // folder belongs to an org the user has no access to

      // 1. getFolderById with auth org (7682) — not found
      serviceContext.dbConnections['media_platform'].read._push([], false, [], null, true);
      // 2. getFolderByTreeObjectId fallback also fails
      serviceContext.dbConnections['media_platform'].read._push([], false, [], null, true);
      // 3. _getFolderOrgById — returns the foreign org
      serviceContext.dbConnections['media_platform'].read._push(
        [{ organization_id: FOLDER_ORG }],
        false
      );
      // 4. Retry getFolderById with FOLDER_ORG — succeeds
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: FOLDER_ID, name: 'folder_name', parentFolderId: 'parent_folder_id', organizationId: FOLDER_ORG }],
        false
      );
      // 5. _userHasV2FolderAccess — user does NOT own any root folder tree containing this folder
      serviceContext.dbConnections['media_platform'].read._push([], false);

      try {
        await dal.deleteFolder(context, { input: { id: FOLDER_ID } });
        throw new Error('Expected deleteFolder to throw');
      } catch (error) {
        expect(error.name).toBe('not_found');
      }
    });
    it('should reject same-org delete when user has no access to the folder tree', async function () {
      const context = mockUtil.makeContext(); // auth org = 7682
      const FOLDER_ID = 'd71ce223-4df9-4ac6-b911-af7082efc673';

      // 1. getFolderById with auth org (7682) — succeeds (same org, folder exists)
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: FOLDER_ID, name: 'folder_name', parentFolderId: 'parent_folder_id', organizationId: 7682 }],
        false
      );
      // 2. _userHasV2FolderAccess — user does NOT own the root folder tree (e.g. folder belongs to another user's personal tree)
      serviceContext.dbConnections['media_platform'].read._push([], false);

      try {
        await dal.deleteFolder(context, { input: { id: FOLDER_ID } });
        throw new Error('Expected deleteFolder to throw');
      } catch (error) {
        expect(error.name).toBe('not_found');
      }
    });
    it('should delete folder when input.id is a treeObjectId', async function () {
      const context = mockUtil.makeContext();
      const TREE_OBJECT_ID = 'a11bb223-3cc4-4dd5-b911-af7082efc671'; // input.id (treeObjectId)
      const FOLDER_ID = 'b90ae112-2bf9-4ac6-b911-af7082efc671'; // actual folder_id resolved via lookup

      // 1. getFolderById primary query — treeObjectId does not match any folder_id, throws
      serviceContext.dbConnections['media_platform'].read._push([], false, [], null, true);
      // 2. getFolderByTreeObjectId fallback (called internally by getFolderById) — resolves treeObjectId → folder
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: FOLDER_ID, name: 'folder_name', parentFolderId: 'parent_folder_id' }],
        false
      );
      // 3. _userHasV2FolderAccess using folder.id (not input treeObjectId) — user has access
      serviceContext.dbConnections['media_platform'].read._push([{ '?column?': 1 }], false);
      // 4. _getFolders — no children
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // 5. getFolderObjects — no objects
      serviceContext.dbConnections['media_platform'].read._push([], false);
      // 6. getFolderContentTemplates -> _validateFolderId -> getFolderById
      mockForValidateFolderId(FOLDER_ID);
      // 7. getFolderContentTemplates SDO query — no SDOs
      serviceContext.dbConnections['media_platform'].read._push([], false);

      // Write: _deleteFolder must use the resolved FOLDER_ID, not the input treeObjectId
      serviceContext.dbConnections['media_platform'].write._push(
        [{ id: FOLDER_ID, organizationId: 7682 }],
        false,
        ['DELETE', 'v2_folder'],
        (sql, params) => {
          expect(params[0]).toEqual(FOLDER_ID);
          expect(params[0]).not.toEqual(TREE_OBJECT_ID);
          expect(params[1]).toEqual(7682);
          return true;
        }
      );
      serviceContext.dal.entityTags.updateEntityTags.mockReturnValue({});

      await dal.deleteFolder(context, {
        input: { id: TREE_OBJECT_ID }
      });

      expect(serviceContext.dal.entityTags.updateEntityTags).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: FOLDER_ID }),
        expect.any(Object),
        expect.any(Object)
      );
    });
    it('should not delete root folder', async function () {
      const context = mockUtil.makeContext();
      // get folder
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            name: 'folder_name'
          }
        ],
        false
      );
      // _userHasV2FolderAccess — user has access
      serviceContext.dbConnections['media_platform'].read._push([{ '?column?': 1 }], false);
      try {
        await dal.deleteFolder(context, {
          input: {
            id: 'b90ae112-2bf9-4ac6-b911-af7082efc671'
          }
        });
      } catch (error) {
        expect(error.message).toBe('Can not delete root folder');
        expect(error.name).toBe('not_allowed');
      }
    });
  });
  describe('#createFolderContentTemplate', () => {
    it('should error if no input', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.createFolderContentTemplate(context, {});
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toContain('input parameter is required.');
      }
    });
    it('should error if missing contentTemplateId', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.createFolderContentTemplate(context, {
          input: {}
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toContain(
          'Missing or empty id field. A non-empty value is required.'
        );
      }
    });
    it('should create folderContentTemplate', async () => {
      const context = mockUtil.makeContext();
      // mockForValidateFolderId
      mockForValidateFolderId('folder_id');
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            contentTemplateId: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
            folderId: '57600f00-8152-4d12-8d48-8a7364dde01f',
            sdoId: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            schemaId: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        false
      );
      let result, error;
      try {
        result = await dal.createFolderContentTemplate(context, {
          input: {
            contentTemplateId: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
            folderId: '57600f00-8152-4d12-8d48-8a7364dde01f',
            sdoId: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            schemaId: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeUndefined();
      expect(result.contentTemplateId).toEqual(
        '57600f00-8152-4d12-8d48-8a7364dde01f::b90ae112-2bf9-4ac6-b911-af7082efc671'
      );
    });
  });
  describe('#updateFolderContentTemplate', () => {
    it('should error if contentTemplateId is missing', async () => {
      const context = mockUtil.makeContext();
      // mockForValidateFolderId
      mockForValidateFolderId('folder_id');
      try {
        await dal.updateFolderContentTemplate(context, {});
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toContain(
          'Missing or empty id field. A non-empty value is required.'
        );
      }
    });
    it('should error if content template was not found or deleted', async () => {
      const context = mockUtil.makeContext();
      // mockForValidateFolderId
      mockForValidateFolderId('folder_id');
      serviceContext.dbConnections['media_platform'].read._push([], false);
      try {
        await dal.updateFolderContentTemplate(context, {
          input: {
            id:
              'd3ea1e72-9356-4910-adad-ac6f4e5524c2::b90ae112-2bf9-4ac6-b911-af7082efc671',
            folderId: '57600f00-8152-4d12-8d48-8a7364dde01f',
            sdoId: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            schemaId: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toContain(
          'The content template was not found or deleted.'
        );
      }
    });
    it('should create content template', async () => {
      const context = mockUtil.makeContext();
      // mockForValidateFolderId: the input
      mockForValidateFolderId('57600f00-8152-4d12-8d48-8a7364dde01f');
      // getFolderContentTemplates --> mockForValidateFolderId
      mockForValidateFolderId('57600f00-8152-4d12-8d48-8a7364dde01f');
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id:
              '57600f00-8152-4d12-8d48-8a7364dde01f::b90ae112-2bf9-4ac6-b911-af7082efc671',
            folderId: '57600f00-8152-4d12-8d48-8a7364dde01f',
            sdoId: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            schemaId: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id:
              '57600f00-8152-4d12-8d48-8a7364dde01f::b90ae112-2bf9-4ac6-b911-af7082efc671',
            folderId: '57600f00-8152-4d12-8d48-8a7364dde01f',
            sdoId: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            schemaId: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        false
      );

      let error;
      try {
        await dal.updateFolderContentTemplate(context, {
          input: {
            id:
              '57600f00-8152-4d12-8d48-8a7364dde01f::b90ae112-2bf9-4ac6-b911-af7082efc671',
            folderId: '57600f00-8152-4d12-8d48-8a7364dde01f',
            sdoId: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            schemaId: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeUndefined();
    });
  });
  describe('#deleteFolderContentTemplate', () => {
    it('should error with invalid input', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.deleteFolderContentTemplate(context, {});
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toContain(
          'V2 Folder: folderId and sdoId are required'
        );
      }
    });
    it('should error with non-uuid input id', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.deleteFolderContentTemplate(context, {
          folderId: '---invalid_folder_id---',
          sdoId: '---invalid_sdo_id---'
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toContain(
          'Invalid ID format A ---invalid_folder_id--- must be a UUID.'
        );
      }
    });
    it('should delete content template', async () => {
      const context = mockUtil.makeContext();
      // mockForValidateFolderId
      mockForValidateFolderId('folder_id');
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
            folderId: '57600f00-8152-4d12-8d48-8a7364dde01f',
            sdoId: 'b90ae112-2bf9-4ac6-b911-af7082efc671',
            schemaId: '1ace46d4-9e27-4fea-9623-75231ff21195'
          }
        ],
        false
      );
      let error;
      try {
        await dal.deleteFolderContentTemplate(context, {
          folderId: '57600f00-8152-4d12-8d48-8a7364dde01f',
          sdoId: 'b90ae112-2bf9-4ac6-b911-af7082efc671'
        });
      } catch (err) {
        error = err;
      }

      expect(error).toBeUndefined();
    });
  });
  describe('#getRootFolders', function () {
    it('should return root folders', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 2,
          name: 'watchlist'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'org_r_id',
            organizationId: 1
          },
          {
            id: 'user_r_id',
            organizationId: 1
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[0]).toEqual(2); // folder_type_id
          expect(sql).not.toMatch(/vf\.folder_id\s=/);
          expect(sql).toMatch(/vfr\.organization_id\s=/);
          expect(sql).toMatch(/vfr\.root_folder_user_id\s=/);

          return true;
        }
      );
      const context = mockUtil.makeContext();
      const res = await dal.getRootFolders(context, {
        rootFolderType: 'watchlist'
      });
      expect(res.length).toEqual(2);
    });
    it('should return root folder by id', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 2,
          name: 'watchlist'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'f_id',
            organizationId: 1
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[0]).toEqual(2); // folder_type_id
          expect(sql).toMatch(/vf\.folder_id\s=/);
          expect(sql).not.toMatch(/vfr\.organization_id\s=/);
          expect(sql).not.toMatch(/vfr\.root_folder_user_id\s=/);

          return true;
        }
      );
      const context = mockUtil.makeContext();
      const res = await dal.getRootFolders(context, {
        type: 'watchlist',
        skipAuth: true,
        id: '00000000-0000-0000-0000-000000000000'
      });
      expect(res.length).toEqual(1);
    });
    it('should handle V1 user root folder fallback when org is oldest', async function () {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.userId', 'user_123');
      _.set(context, '_authInfo.organization.organizationId', 100);

      // getFolderTypeByName
      serviceContext.dbConnections['media_platform'].read._push([
        { id: 5, name: 'cms' }
      ]);
      // _handleV1UserRootFolderFallback
      serviceContext.dbConnections['media_platform'].read._push([
        { folder_id: 'v1-folder-id' }
      ]);
      // _isOldestOrgForUser
      serviceContext.dbConnections['sso'].read._push([
        { organization_id: 100 }
      ]);
      // _fixupV1UserRootFolder
      serviceContext.dbConnections['media_platform'].write._push([
        { folder_id: 'v1-folder-id' }
      ]);
      // _fixupV1UserRootFolder
      serviceContext.dbConnections['media_platform'].write._push([]);
      // getRootFolders - main query
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'v1-folder-id',
          folderTypeId: 5,
          organizationId: 100,
          rootFolderUserId: 'user_123'
        }
      ]);

      const res = await dal.getRootFolders(context, {
        rootFolderType: 'cms',
        organizationId: 100
      });

      expect(res).toBeDefined();
      expect(res.length).toEqual(1);
      expect(res[0].organizationId).toEqual(100);
    });
    it('should NOT claim V1 folder when org is not oldest', async function () {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.userId', 'user_123');
      _.set(context, '_authInfo.organization.organizationId', 200);

      // getFolderTypeByName
      serviceContext.dbConnections['media_platform'].read._push([
        { id: 5, name: 'cms' }
      ]);
      // _handleV1UserRootFolderFallback
      serviceContext.dbConnections['media_platform'].read._push([
        { folder_id: 'v1-folder-id' }
      ]);
      // _isOldestOrgForUser
      serviceContext.dbConnections['sso'].read._push([
        { organization_id: 100 }
      ]);
      // getRootFolders
      serviceContext.dbConnections['media_platform'].read._push([]);

      const res = await dal.getRootFolders(context, {
        rootFolderType: 'cms',
        organizationId: 200
      });

      expect(res).toEqual([]);
    });
    it('should scope the V1 root-folder org reassignment to the resolving root\'s own subtree, not globally (VE-26538)', async function () {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.userId', 'user_123');
      _.set(context, '_authInfo.organization.organizationId', 100);

      let subtreeFixupSql;
      let subtreeFixupParams;

      // getFolderTypeByName
      serviceContext.dbConnections['media_platform'].read._push([
        { id: 5, name: 'cms' }
      ]);
      // _handleV1UserRootFolderFallback
      serviceContext.dbConnections['media_platform'].read._push([
        { folder_id: 'v1-folder-id' }
      ]);
      // _isOldestOrgForUser
      serviceContext.dbConnections['sso'].read._push([
        { organization_id: 100 }
      ]);
      // _fixupV1UserRootFolder — root-level UPDATE resolves (result truthy)
      serviceContext.dbConnections['media_platform'].write._push([
        { folder_id: 'v1-folder-id' }
      ]);
      // _fixupV1UserRootFolder — subtree fixup query. Capture the SQL + params
      // rather than asserting inline: this call is reached through
      // _handleV1UserRootFolderFallback's try/catch, which swallows any
      // thrown error (including a failed inline `expect`), so an inline
      // assertion here would silently pass even on a real regression.
      serviceContext.dbConnections['media_platform'].write._push(
        [],
        false,
        [],
        (sql, params) => {
          subtreeFixupSql = sql;
          subtreeFixupParams = params;
          return true;
        }
      );
      // getRootFolders - main query
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'v1-folder-id',
          folderTypeId: 5,
          organizationId: 100,
          rootFolderUserId: 'user_123'
        }
      ]);

      const res = await dal.getRootFolders(context, {
        rootFolderType: 'cms',
        organizationId: 100
      });

      expect(res.length).toEqual(1);
      // The subtree fixup must be parameterized by THIS root's own folder id
      // (not omitted / not a different root's id) — a regression to the
      // pre-fix operator-precedence bug (VE-26538) reassigned every -1-org
      // folder across ALL organizations, regardless of this parameter.
      expect(subtreeFixupParams[0]).toEqual(100);
      expect(subtreeFixupParams[1]).toEqual('v1-folder-id');
      // The WHERE clause must scope the update via this root's folder_path
      // subtree. Without this, the query would re-tenant every orphaned
      // (-1 / NULL org) folder and object system-wide to $1, not just the
      // folders/objects beneath this specific root.
      const normalizedSql = subtreeFixupSql.toLowerCase().replace(/\s+/g, ' ');
      expect(normalizedSql).toMatch(/folder_path\s*<@/i);
      // The pre-fix bug combined the org filter and the subtree filter in a
      // single ungrouped WHERE — `organization_id = -1 OR organization_id IS
      // NULL AND folder_path <@ (...)` — which (AND binds tighter than OR)
      // matches every `-1` folder regardless of folder_path. The fix scopes
      // folder_path in its own CTE, joined separately from the org check, so
      // this exact fragment must NOT reappear.
      expect(normalizedSql).not.toMatch(
        /organization_id\s*=\s*-1\s+or\s+(?:vf\.|o\.)?organization_id\s+is\s+null\s+and\s+folder_path/
      );
    });
  });

  describe('#createRootFolder', function () {
    it('should throw error if missing organizationId', async function () {
      try {
        await dal.createRootFolder(mockUtil.makeContext(), {});
      } catch (err) {
        expect(err.message).toMatch(/organizationId\sis\srequired/);
      }
    });
    it('should throw error if missing folderTypeId', async function () {
      try {
        serviceContext.dbConnections['media_platform'].read._push([]);
        await dal.createRootFolder(mockUtil.makeContext(), {
          organizationId: 1
        });
      } catch (err) {
        expect(err.message).toMatch(/folderTypeId\sis\srequired/);
      }
    });
    it('should return root folder', async function () {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'cms'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);

      // buildRootFolderName - serviceContext.dal.admin.getUser
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
          user_name: 'Test User'
        }
      ]);
      // createFolder
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folder_id: 'f_id'
          }
        ],
        false,
        ['ins_f'],
        (sql, params) => {
          expect(params[0]).toEqual(1);
          expect(params[1]).toEqual(5); // folderTypeId
          expect(params[2]).toEqual('r_id_from_args');
          expect(params[3]).toEqual(expect.any(String)); // folder name
          expect(params[4]).toEqual(expect.any(String)); // folder desc
          expect(params[5]).toEqual(_.get(context, '_authInfo.userId')); // createdBy
          expect(params[6]).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396');
          expect(params[7]).toEqual(expect.any(String));

          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);

      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderById
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'r_id_from_args',
            organizationId: 1,
            folderTypeId: 5,
            rootFolderUserId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(sql).toMatch(/vfr\.root_folder_user_id\s=/);
          expect(params).toEqual([
            'r_id_from_args', // folder_id
            1, // vfr.organization_id
            1, // vf.organization_id
            '513e96ec-2bea-49a5-9d98-dc74ac19b396' // rootFolderUserId
          ]);
          return true;
        }
      );

      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockResolvedValue();

      const res = await dal.createRootFolder(context, {
        folderType: 'cms',
        organizationId: 1,
        rootFolderUserId: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
        id: 'r_id_from_args'
      });
      expect(res).toMatchObject({
        id: 'r_id_from_args',
        organizationId: 1,
        folderTypeId: 5,
        rootFolderUserId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
      });
      expect(
        serviceContext.bll.rbacAuth.addDefaultACEsToResources
      ).toHaveBeenCalledWith(
        expect.any(Object),
        {
          organizationId: 1,
          objectId: 'r_id_from_args',
          resourceType: 'Folder',
          ownerId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        },
        expect.objectContaining({
          dbClients: {
            media_platform: expect.any(Object),
            sso: expect.any(Object)
          }
        })
      );
    });

    it('should reuse the output from v1 for org root folder', async function () {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 2,
          name: 'watchlist'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folder_id: 'f_id'
          }
        ],
        false,
        ['ins_f'],
        (sql, params) => {
          expect(params[0]).toEqual(1);
          expect(params[1]).toEqual(2); // folderTypeId
          expect(params[2]).toEqual('v1-root-folder-id');
          expect(params[3]).toEqual(expect.any(String)); // folder name
          expect(params[4]).toEqual(expect.any(String)); // folder desc
          expect(params[5]).toEqual(_.get(context, '_authInfo.userId')); // createdBy
          expect(params[6]).toBeUndefined();
          expect(params[7]).toEqual(expect.any(String));

          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderById
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'v1-root-folder-id',
          organizationId: 1,
          folderTypeId: 2,
          rootFolderUserId: 'user_id'
        }
      ]);

      const res = await dal.createRootFolder(context, {
        folderType: 'watchlist',
        organizationId: 1,
        v1Output: {
          rootFolderId: 'v1-root-folder-id',
          objectId: 'v1-object-id',
          name: 'v1-root-folder-name'
        }
      });
      expect(res).toMatchObject({
        id: 'v1-root-folder-id',
        organizationId: 1,
        folderTypeId: 2
      });
    });

    it('should use v1Output.treeObjectId for claiming org user root folder (args.id is set)', async function () {
      // When args.id is set, this is the "claiming" org — it should preserve the V1 treeObjectId.
      // Other orgs (args.id not set) get treeObjectId = folderId to prevent cross-org collision.
      const context = mockUtil.makeContext();
      const v1TreeObjectId = 'v1-tree-object-id-user';
      const v1RootFolderId = 'v1-root-folder-id-user';

      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'cms'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);

      // buildRootFolderName - serviceContext.dal.admin.getUser
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
          user_name: 'Test User'
        }
      ]);
      // createFolder SQL - verify treeObjectId (params[8]) equals v1Output.treeObjectId for claiming org
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folder_id: v1RootFolderId
          }
        ],
        false,
        ['ins_f'],
        (sql, params) => {
          expect(params[2]).toEqual(v1RootFolderId); // folderId = args.id from v1
          expect(params[6]).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396'); // rootFolderUserId
          expect(params[8]).toEqual(v1TreeObjectId); // treeObjectId preserved from v1Output (claiming org)
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);

      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderById (getRootFolders)
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: v1RootFolderId,
          organizationId: 1,
          folderTypeId: 5,
          rootFolderUserId: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
          tree_object_id: v1TreeObjectId
        }
      ]);

      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockResolvedValue();

      const res = await dal.createRootFolder(context, {
        folderType: 'cms',
        organizationId: 1,
        rootFolderUserId: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
        id: v1RootFolderId,
        v1Output: {
          treeObjectId: v1TreeObjectId,
          rootFolderId: v1RootFolderId,
          userId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        }
      });
      expect(res).toMatchObject({
        id: v1RootFolderId,
        organizationId: 1
      });
    });

    it('should fall back to folderId as treeObjectId for user root folder when v1Output is empty', async function () {
      const context = mockUtil.makeContext();
      const userFolderId = 'user-folder-uuid';

      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'cms'
        }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);

      // buildRootFolderName - serviceContext.dal.admin.getUser
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
          user_name: 'Test User'
        }
      ]);
      // createFolder SQL - verify treeObjectId falls back to folderId
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            folder_id: userFolderId
          }
        ],
        false,
        ['ins_f'],
        (sql, params) => {
          expect(params[2]).toEqual(userFolderId); // folderId
          expect(params[6]).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396'); // rootFolderUserId
          // treeObjectId should equal folderId when v1Output has no treeObjectId
          expect(params[8]).toEqual(userFolderId);
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);

      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderById (getRootFolders)
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: userFolderId,
          organizationId: 1,
          folderTypeId: 5,
          rootFolderUserId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        }
      ]);

      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockResolvedValue();

      const res = await dal.createRootFolder(context, {
        folderType: 'cms',
        organizationId: 1,
        rootFolderUserId: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
        id: userFolderId
      });
      expect(res).toMatchObject({
        id: userFolderId,
        organizationId: 1
      });
    });
  });

  describe('#getOrCreateRootFolders', function () {
    it('should get root folders if they exist', async function () {
      const context = mockUtil.makeContext();

      _.set(context, '_authInfo.userId', 'user_id');
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'CMS'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'org_r_f',
          folderTypeId: 5,
          organizationId: 1
        },
        {
          id: 'user_r_f',
          folderTypeId: 5,
          organizationId: 1,
          rootFolderUserId: 'user_id'
        }
      ]);
      const res = await dal.getOrCreateRootFolders(context, {
        organizationId: 1,
        rootFolderType: 'cms'
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
    });

    it('should create org if only user exists', async function () {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.userId', 'user_id');
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'CMS'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'user_r_f',
          folderTypeId: 5,
          organizationId: 1,
          rootFolderUserId: 'user_id'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folderId: 'org_r_f'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolder
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'org_r_f',
          folderTypeId: 5,
          organizationId: 1
        }
      ]);

      const res = await dal.getOrCreateRootFolders(context, {
        organizationId: 1,
        rootFolderType: 'cms'
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
    });

    it('should create user if only org exists', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'CMS'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'org_r_f',
          folderTypeId: 5,
          organizationId: 1
        }
      ]);
      // _buildUserRootFolderArgs -> _findV1UserRootFolderId (no v1Output passed;
      // no V1 user-root found -> mint fresh, preserving original behavior)
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);

      // buildRootFolderName - serviceContext.dal.admin.getUser
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
          user_name: 'Test User'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folderId: 'user_r_f'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolder
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'user_r_f',
          folderTypeId: 5,
          organizationId: 1,
          rootFolderUserId: 'user_id'
        }
      ]);

      const res = await dal.getOrCreateRootFolders(mockUtil.makeContext(), {
        organizationId: 1,
        rootFolderType: 'cms'
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
    });

    it('should get root folders if rootFolders empty and only org exists', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'CMS'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folderId: 'org_r_f'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolder
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'org_r_f',
          folderTypeId: 5,
          organizationId: 1
        }
      ]);
      const context = mockUtil.makeContext();
      context._authInfo = {};
      const res = await dal.getOrCreateRootFolders(context, {
        organizationId: 1,
        rootFolderType: 'cms'
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(1);
    });

    it('should get root folders if rootFolders empty, user and only org do not exist', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'CMS'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folderId: 'org_r_f'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolder
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'org_r_f',
          folderTypeId: 5,
          organizationId: 1
        }
      ]);
      // _buildUserRootFolderArgs -> _findV1UserRootFolderId (no v1Output passed;
      // no V1 user-root found -> mint fresh, preserving original behavior)
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
          user_name: 'Test User'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folderId: 'user_r_f'
          }
        ],
        false
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolder
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'user_r_f',
          folderTypeId: 5,
          organizationId: 1,
          rootFolderUserId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        }
      ]);

      let context = mockUtil.makeContext();
      const res = await dal.getOrCreateRootFolders(context, {
        organizationId: 1,
        rootFolderType: 'cms'
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
    });

    it('should preserve v1Output.treeObjectId for claiming org via _buildUserRootFolderArgs (prevents cross-org collision for others)', async function () {
      const v1TreeObjectId = 'v1-tree-object-id-from-v1-output';
      const v1UserRootFolderId = 'v1-user-root-folder-id';
      const v1OrgRootFolderId = 'v1-org-root-folder-id';
      const userId = '513e96ec-2bea-49a5-9d98-dc74ac19b396';
      const organizationId = 1;

      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.userId', userId);

      // getFolderTypeByName
      serviceContext.dbConnections['media_platform'].read._push([
        { id: 5, name: 'CMS' }
      ]);
      // _handleV1UserRootFolderFallback
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getRootFolders — empty (no existing root folders)
      serviceContext.dbConnections['media_platform'].read._push([]);

      // --- Create org root folder ---
      // createRootFolder for org: getFolderTypeByName (cached)
      serviceContext.dbConnections['media_platform'].read._push(
        [{ folderId: v1OrgRootFolderId }],
        false
      );
      // getRootFolders for org
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: v1OrgRootFolderId,
          organizationId: organizationId,
          folderTypeId: 5
        }
      ]);

      // --- Create user root folder ---
      // _buildUserRootFolderArgs: _isV1IdAlreadyUsedInV2
      serviceContext.dbConnections['media_platform'].read._push([]); // not already used
      // _buildUserRootFolderArgs: _determineTargetOrgForV1Id -> _getOldestOrgForUser
      serviceContext.dbConnections['sso'].read._push([
        { organization_id: organizationId }
      ]);

      // createRootFolder: transaction begin
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      // buildRootFolderName: getUser
      serviceContext.dbConnections['sso'].read._push([
        { user_id: userId, user_name: 'Test User' }
      ]);
      // createRootFolder SQL - THIS IS THE KEY ASSERTION
      serviceContext.dbConnections['media_platform'].write._push(
        [{ folder_id: v1UserRootFolderId }],
        false,
        ['ins_f'],
        (sql, params) => {
          // params[2] = folderId, params[8] = treeObjectId
          expect(params[2]).toEqual(v1UserRootFolderId); // folder_id should be v1 rootFolderId
          // Claiming org (args.id set) preserves v1Output.treeObjectId
          expect(params[8]).toEqual(v1TreeObjectId);
          return true;
        }
      );
      // createRootFolder: commit
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      // getRootFolders after user create
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: v1UserRootFolderId,
          organizationId: organizationId,
          folderTypeId: 5,
          rootFolderUserId: userId,
          tree_object_id: v1TreeObjectId
        }
      ]);

      serviceContext.bll.rbacAuth.addDefaultACEsToResources.mockResolvedValue();

      const res = await dal.getOrCreateRootFolders(context, {
        organizationId: organizationId,
        rootFolderType: 'cms',
        v1Output: [
          {
            organizationId: organizationId,
            rootFolderId: v1OrgRootFolderId,
            treeObjectId: 'v1-org-tree-object-id'
          },
          {
            userId: userId,
            rootFolderId: v1UserRootFolderId,
            objectId: v1UserRootFolderId,
            treeObjectId: v1TreeObjectId
          }
        ]
      });

      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
      const userFolder = res.find((f) => f.rootFolderUserId === userId);
      expect(userFolder).toBeDefined();
      expect(userFolder.treeObjectId).toEqual(v1TreeObjectId);
    });
  });

  // Regression coverage for T13: V1/V2 user-root folder-id divergence.
  //
  // The V2 user-root must reuse the V1 root_folder id so that a share written
  // to the V1 store (V1-authoritative org) and a read served from the V2 store
  // (V2-authoritative org) address the same physical folder. The reuse decision
  // in _buildUserRootFolderArgs used to depend entirely on the caller threading
  // a correctly-shaped v1UserRootFolder in v1Output; any caller that passed an
  // org-shaped v1Output (or none) minted a fresh V2 uuid, permanently diverging
  // the two stores. The fix makes _buildUserRootFolderArgs independently look up
  // the V1 user-root when the caller didn't hand it one.
  describe('#V1/V2 user-root id parity (T13)', function () {
    const userId = '10ffa55a-d68b-494b-83df-49ce2d008e6d';
    const organizationId = 1;
    const v1UserRootId = '897e8477-e1a7-458f-9299-b8ada9fa22d2';
    // The V1 tree_object_id is a DISTINCT PK from root_folder_id (verified live
    // against the T13 preserved DB). The reused V2 row must mirror BOTH.
    const v1TreeObjectId = 'd38963ac-dcca-42be-88d0-689ccf9bd999';

    it('reuses the V1 user-root id when the caller passes NO v1Output (plural getOrCreateRootFolders)', async function () {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.userId', userId);

      // getFolderTypeByName
      serviceContext.dbConnections['media_platform'].read._push([
        { id: 5, name: 'CMS' }
      ]);
      // _handleV1UserRootFolderFallback
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getRootFolders — org root exists, user root does NOT
      serviceContext.dbConnections['media_platform'].read._push([
        { id: 'org_r_f', folderTypeId: 5, organizationId }
      ]);
      // _buildUserRootFolderArgs -> _findV1UserRootFolder: V1 user-root EXISTS.
      // This is the key input: the caller passed no v1Output, but the V1 row is
      // there (with its distinct tree_object_id) and must be found and reused.
      serviceContext.dbConnections['media_platform'].read._push([
        { root_folder_id: v1UserRootId, tree_object_id: v1TreeObjectId }
      ]);
      // _isV1IdAlreadyUsedInV2 -> not yet used in V2
      serviceContext.dbConnections['media_platform'].read._push([]);
      // _determineTargetOrgForV1Id -> _getOldestOrgForUser -> matches org
      serviceContext.dbConnections['sso'].read._push([
        { organization_id: organizationId }
      ]);
      // createRootFolder transaction
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      // buildRootFolderName -> getUser
      serviceContext.dbConnections['sso'].read._push([
        { user_id: userId, user_name: 'Test User' }
      ]);
      // createRootFolder INSERT — THE ASSERTION: folder_id AND tree_object_id
      // must both be the V1 ids, not freshly-minted / folder-id-fallback values.
      serviceContext.dbConnections['media_platform'].write._push(
        [{ folder_id: v1UserRootId }],
        false,
        ['ins_f'],
        (sql, params) => {
          // params[2] = folder_id, params[8] = tree_object_id (see
          // #createRootFolder tests). The V2 row must adopt both V1 ids.
          expect(params[2]).toEqual(v1UserRootId);
          expect(params[8]).toEqual(v1TreeObjectId);
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolder
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: v1UserRootId,
          folderTypeId: 5,
          organizationId,
          rootFolderUserId: userId
        }
      ]);

      const res = await dal.getOrCreateRootFolders(context, {
        organizationId,
        rootFolderType: 'cms'
        // deliberately NO v1Output — the divergence trigger
      });
      expect(res).toBeDefined();
      const userFolder = res.find((f) => f.rootFolderUserId === userId);
      expect(userFolder).toBeDefined();
      expect(userFolder.id).toEqual(v1UserRootId);
    });

    it('reuses the V1 user-root id when the caller passes an ORG-shaped v1Output (singular getOrCreateRootFolder)', async function () {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.userId', userId);

      // getFolderTypeByName
      serviceContext.dbConnections['media_platform'].read._push([
        { id: 5, name: 'CMS' }
      ]);
      // _handleV1UserRootFolderFallback
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getRootFolders — user root does NOT exist yet
      serviceContext.dbConnections['media_platform'].read._push([]);
      // _buildUserRootFolderArgs -> _findV1UserRootFolder: V1 user-root EXISTS
      serviceContext.dbConnections['media_platform'].read._push([
        { root_folder_id: v1UserRootId, tree_object_id: v1TreeObjectId }
      ]);
      // _isV1IdAlreadyUsedInV2 -> not yet used
      serviceContext.dbConnections['media_platform'].read._push([]);
      // _determineTargetOrgForV1Id -> _getOldestOrgForUser -> matches org
      serviceContext.dbConnections['sso'].read._push([
        { organization_id: organizationId }
      ]);
      // createRootFolder transaction
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['sso'].read._push([
        { user_id: userId, user_name: 'Test User' }
      ]);
      // createRootFolder INSERT — must reuse V1 folder id AND tree_object id even
      // though v1Output was org-shaped.
      serviceContext.dbConnections['media_platform'].write._push(
        [{ folder_id: v1UserRootId }],
        false,
        ['ins_f'],
        (sql, params) => {
          expect(params[2]).toEqual(v1UserRootId);
          expect(params[8]).toEqual(v1TreeObjectId);
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderById
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: v1UserRootId,
          organizationId,
          folderTypeId: 5,
          rootFolderUserId: userId
        }
      ]);

      const res = await dal.getOrCreateRootFolder(context, {
        organizationId,
        rootFolderType: 'cms',
        userId,
        // org-shaped v1Output: has organizationId, so the singular extraction
        // (v1Output.userId && !v1Output.organizationId) yields null — exactly the
        // shape that used to cause a fresh-uuid mint.
        v1Output: { organizationId, rootFolderId: 'v1-org-root-id' }
      });
      expect(res).toBeDefined();
      expect(res.id).toEqual(v1UserRootId);
    });

    it('does NOT reuse a V1 id when _determineTargetOrgForV1Id resolves a different org (cross-org collision guard preserved)', async function () {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.userId', userId);

      // getFolderTypeByName
      serviceContext.dbConnections['media_platform'].read._push([
        { id: 5, name: 'CMS' }
      ]);
      // _handleV1UserRootFolderFallback
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getRootFolders — user root does NOT exist yet
      serviceContext.dbConnections['media_platform'].read._push([]);
      // _findV1UserRootFolder: V1 user-root EXISTS
      serviceContext.dbConnections['media_platform'].read._push([
        { root_folder_id: v1UserRootId, tree_object_id: v1TreeObjectId }
      ]);
      // _isV1IdAlreadyUsedInV2 -> not used
      serviceContext.dbConnections['media_platform'].read._push([]);
      // _determineTargetOrgForV1Id -> oldest org is a DIFFERENT org (999).
      // The V1 id belongs to that org's claim; this org must mint fresh to avoid
      // stealing it — the same guard the passed-in-v1Output path enforces.
      serviceContext.dbConnections['sso'].read._push([
        { organization_id: 999 }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['sso'].read._push([
        { user_id: userId, user_name: 'Test User' }
      ]);
      // createRootFolder INSERT — folder_id must NOT be the V1 id (fresh uuid)
      serviceContext.dbConnections['media_platform'].write._push(
        [{ folder_id: 'fresh_uuid' }],
        false,
        ['ins_f'],
        (sql, params) => {
          expect(params[2]).not.toEqual(v1UserRootId);
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'fresh_uuid',
          organizationId,
          folderTypeId: 5,
          rootFolderUserId: userId
        }
      ]);

      const res = await dal.getOrCreateRootFolder(context, {
        organizationId,
        rootFolderType: 'cms',
        userId
      });
      expect(res).toBeDefined();
    });
  });

  describe('#getOrCreateRootFolder', function () {
    it('should throw error if missing input', async function () {
      try {
        await dal.getOrCreateRootFolder(mockUtil.makeContext(), {});
      } catch (e) {
        expect(e.message).toMatch(/rootFolderType\sis\srequired/);
      }
    });

    it('should create Org root folder', async function () {
      // FolderType
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'CMS'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      // get existing org roots
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folder_id: 'f_id'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[6]).toBeUndefined(); // rootFolderUserId
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderById
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'f_id',
          organizationId: 1,
          folderTypeId: 5
        }
      ]);
      const res = await dal.getOrCreateRootFolder(mockUtil.makeContext(), {
        organizationId: 1,
        rootFolderType: 'cms'
      });
      expect(res).toBeDefined();
    });

    it('should create User Root Folder', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'CMS'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      // get existing user roots
      serviceContext.dbConnections['media_platform'].read._push([]);
      // _buildUserRootFolderArgs -> _findV1UserRootFolderId (no v1Output passed;
      // no V1 user-root found -> mint fresh, preserving original behavior)
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
          user_name: 'Test User'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folder_id: 'f_id'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[6]).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396'); // rootFolderUserId
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderById
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'f_id',
          organizationId: 1,
          folderTypeId: 5
        }
      ]);

      const res = await dal.getOrCreateRootFolder(mockUtil.makeContext(), {
        organizationId: 1,
        rootFolderType: 'cms',
        userId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
      });
      expect(res).toBeDefined();
    });

    it('should create User Root Folder - organizationId from context', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'CMS'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);
      // get existing user roots
      serviceContext.dbConnections['media_platform'].read._push([]);
      // _buildUserRootFolderArgs -> _findV1UserRootFolderId (no v1Output passed;
      // no V1 user-root found -> mint fresh, preserving original behavior)
      serviceContext.dbConnections['media_platform'].read._push([]);
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'BEGIN'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['BEGIN']);
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
          user_name: 'Test User'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folder_id: 'f_id'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[6]).toEqual('513e96ec-2bea-49a5-9d98-dc74ac19b396'); // rootFolderUserId
          return true;
        }
      );
      serviceContext.dbConnections['media_platform'].write._push([], false, [
        'COMMIT'
      ]);
      serviceContext.dbConnections['sso'].write._push([], false, ['COMMIT']);
      serviceContext.dbConnections['media_platform'].read._push([]);
      // getFolderById
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'f_id',
          organizationId: 1,
          folderTypeId: 5
        }
      ]);
      const res = await dal.getOrCreateRootFolder(mockUtil.makeContext(), {
        rootFolderType: 'cms',
        userId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
      });
      expect(res).toBeDefined();
    });
  });

  describe('#removeTDOFromFolders', () => {
    let context;
    beforeEach(() => {
      context = mockUtil.makeContext();
      serviceContext.logger.error = jest.fn();
    });

    it('should error with invalid input: missing tdo id', async () => {
      try {
        await dal.removeTDOFromFolders(context);
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toContain('Missing TDO id in the input.');
      }
    });
    it('should error with invalid input: organization id not found', async () => {
      context = {};
      try {
        await dal.removeTDOFromFolders(context, 123);
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toEqual('invalid_input');
        expect(err.message).toContain('Missing organization id');
      }
    });
    it('should remove TDO from folders', async () => {
      serviceContext.dbConnections['media_platform'].write._push(
        [
          {
            objectId: '123'
          }
        ],
        false
      );
      let error;
      try {
        await dal.removeTDOFromFolders(context, 123);
      } catch (err) {
        error = err;
      }

      expect(error).toBeUndefined();
    });
  });

  describe('#getParentFolder', function () {
    it('should throw error when missing objectId', async function () {
      try {
        await dal.getParentFolder(null, 1);
      } catch (e) {
        expect(e.message).toMatch(/objectId\sis\srequired/);
      }
    });
    it('should throw error when missing organizationId', async function () {
      try {
        await dal.getParentFolder('obj_id');
      } catch (e) {
        expect(e.message).toMatch(/organizationId\sis\srequired/);
      }
    });
    it('should return null', async function () {
      serviceContext.dbConnections['media_platform'].read._push([]);
      const res = await dal.getParentFolder('obj_id', 1);
      expect(res).toEqual(null);
    });
    it('should return parent folder', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'f_id',
          folder_type_id: 1,
          organization_id: 1,
          name: '---folder_name---',
          description: 'Unit test folder',
          parent_folder_id: 11111,
          shared_org_read: 0,
          shared_org_write: 0,
          folder_path: '---folder_path---'
        }
      ]);
      const res = await dal.getParentFolder('obj_id', 1);
      expect(res).toBeDefined;
    });

    it('should get parent folder without org filter when using internal token', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'f_id',
            folder_type_id: 1,
            organization_id: 1,
            name: '---folder_name---',
            description: 'Unit test folder',
            parent_folder_id: 11111,
            shared_org_read: 0,
            shared_org_write: 0,
            folder_path: '---folder_path---'
          }
        ],
        false,
        ['folder_path @>'],
        (sql, params) => {
          expect(sql).not.toMatch(/vf\.organization_id\s=/);
          expect(params.length).toEqual(1);
          expect(params[0]).toEqual('p_f_id');
          return true;
        }
      );
      const res = await dal.getParentFolder(context, {
        folderId: 'f_id'
      });
      expect(res).toBeDefined();
    });
  });

  describe('#getParentFoldersForObject', function () {
    it('should throw error when missing objectId', async function () {
      try {
        await dal.getParentFoldersForObject(null, 1);
      } catch (e) {
        expect(e.message).toMatch(/objectId\sis\srequired/);
      }
    });
    it('should throw error when missing organizationId', async function () {
      try {
        await dal.getParentFoldersForObject('obj_id');
      } catch (e) {
        expect(e.message).toMatch(/organizationId\sis\srequired/);
      }
    });
    it('should return array empty', async function () {
      serviceContext.dbConnections['media_platform'].read._push([]);
      const res = await dal.getParentFoldersForObject('obj_id', 1);
      expect(res.length).toEqual(0);
    });
    it('should return array of parent folders', async function () {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'f_id',
            folder_type_id: 1,
            organization_id: 1,
            name: '---folder_name---',
            description: 'Unit test folder',
            parent_folder_id: 11111,
            shared_org_read: 0,
            shared_org_write: 0,
            folder_path: '---folder_path---'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(params[0]).toEqual('obj_id');
          expect(params[1]).toEqual(1);

          return true;
        }
      );
      const res = await dal.getParentFoldersForObject('obj_id', 1);
      expect(res.length).toEqual(1);
    });
  });

  describe('#getSubfolders', function () {
    it('should throw error when missing organizationId', async function () {
      try {
        await dal.getSubfolders({}, {});
      } catch (e) {
        expect(e.message).toMatch(/Missing\sorganization\sid/);
      }
    });
    it('should throw error when missing objectId', async function () {
      try {
        await dal.getSubfolders({}, { organizationId: 1 });
      } catch (e) {
        expect(e.message).toMatch(/folderId\sis\srequired/);
      }
    });
    it('should get subfolders', async function () {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'c_f_1',
            name: 'child folder',
            parentFolderId: 'f_id',
            depth: 1
          },
          {
            id: 'c_f_2',
            name: 'child folder',
            parentFolderId: 'f_id',
            depth: 1
          },
          {
            id: 'c_f_1_1',
            name: 'child folder',
            parentFolderId: 'c_f_1',
            depth: 1
          }
        ],
        false,
        ['parent_folder_id =', 'ORDER BY', 'OFFSET', 'LIMIT']
      );
      const res = await dal.getSubfolders(mockUtil.makeContext(), {
        folderId: 'f_id'
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(3);
    });
    it('should get subfolders with names args', async function () {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'c_f_1',
            name: 'myfolder',
            parentFolderId: 'f_id',
            depth: 1
          },
          {
            id: 'c_f_2',
            name: 'myfolder2',
            parentFolderId: 'f_id',
            depth: 1
          }
        ],
        false,
        [
          'folder_name ILIKE',
          'folder_id <>',
          'folder_path <@',
          'ORDER BY',
          'OFFSET',
          'LIMIT'
        ],
        (sql, params) => {
          expect(sql).not.toMatch(/vf\.parent_folder_id\s=/);
          expect(params[0]).toEqual('f_id');
          expect(params[1]).toEqual(7682);
          expect(params[2]).toEqual('myfolder');
          expect(params[3]).toEqual('myfolder2');
          return true;
        }
      );
      const res = await dal.getSubfolders(mockUtil.makeContext(), {
        folderId: 'f_id',
        names: ['myfolder', 'myfolder2']
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
    });
    it('should get no subfolders', async function () {
      serviceContext.dbConnections['media_platform'].read._push([], false);
      const res = await dal.getSubfolders(mockUtil.makeContext(), {
        folderId: 'f_id'
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(0);
    });
    it('sql query should include default order by', async function () {
      serviceContext.dbConnections['media_platform'].read._push([], false, [
        'folder_id <>',
        'folder_path <@',
        'date_created ASC'
      ]);
      const res = await dal.getSubfolders(mockUtil.makeContext(), {
        folderId: 'f_id',
        orderBy: []
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(0);
    });
    it('sql query should include order by fields', async function () {
      serviceContext.dbConnections['media_platform'].read._push([], false, [
        'folder_name ASC',
        'date_created DESC'
      ]);
      const res = await dal.getSubfolders(mockUtil.makeContext(), {
        folderId: 'f_id',
        orderBy: [
          { field: `name`, direction: 'ASC' },
          { field: `createdDateTime`, direction: 'DESC' }
        ]
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(0);
    });
    it('should get subfolders with entityTags args', async function () {
      serviceContext.dal.entityTags.getEntityIdsByTagKeys.mockImplementation(
        (arg1, arg2, arg3) => {
          expect(arg1).toMatchObject(['tag_001', 'tag_002']);
          expect(arg2).toBe(7682);
          expect(arg3).toEqual('folder');
          return Promise.resolve(['c_f_1', 'c_f_2']);
        }
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'c_f_1',
            name: 'myfolder',
            parentFolderId: 'f_id',
            depth: 1
          },
          {
            id: 'c_f_2',
            name: 'myfolder2',
            parentFolderId: 'f_id',
            depth: 1
          }
        ],
        false,
        ['folder_id <>', 'folder_path <@'],
        (sql, params) => {
          expect(sql).not.toMatch(/vf\.parent_folder_id\s=/);
          expect(params[0]).toEqual('f_id');
          expect(params[1]).toEqual(7682);
          expect(params[2]).toMatchObject(['c_f_1', 'c_f_2']);
          return true;
        }
      );
      const res = await dal.getSubfolders(mockUtil.makeContext(), {
        folderId: 'f_id',
        entityTags: [
          { key: 'tag_001', value: 'tag_value_001' },
          { key: 'tag_002', value: 'tag_value_002' }
        ]
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
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
        folderId: 'f_id',
        entityTags: [
          { key: 'tag_001', value: 'tag_value_001' },
          { key: 'tag_002', value: 'tag_value_002' }
        ]
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(0);
      expect(
        serviceContext.dal.entityTags.getEntityIdsByTagKeys
      ).toHaveBeenCalled();
    });

    it('should apply RBAC auth filter when provided', async () => {
      const mockAuthFilter = jest.fn((idColumn, paramIndex) => {
        return {
          where: `${idColumn} IN (SELECT folder_id FROM rbac_folders WHERE auth_group_id = ANY($${paramIndex}))`,
          join: 'INNER JOIN rbac_folders rf ON rf.folder_id = vf.folder_id',
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
            folder_id: 'c_f_1',
            folder_name: 'authorized_folder',
            folder_description: 'Authorized Folder',
            organization_id: 7682,
            parent_folder_id: 'f_id',
            folder_type_id: 1,
            date_created: new Date(),
            date_modified: new Date(),
            tree_object_id: 'to123'
          }
        ],
        false,
        [],
        (sql, params) => {
          expect(sql).toContain(
            'INNER JOIN rbac_folders rf ON rf.folder_id = vf.folder_id'
          );
          expect(sql).toContain(
            'vf.folder_id IN (SELECT folder_id FROM rbac_folders WHERE auth_group_id = ANY($'
          );
          expect(params[0]).toBe('f_id');
          expect(params[1]).toBe(7682);
          expect(params[2]).toEqual(['auth-group-1', 'auth-group-2']);
          return true;
        }
      );

      const res = await dal.getSubfolders(context, {
        folderId: 'f_id',
        organizationId: 7682
      });

      expect(res).toBeDefined();
      expect(res.length).toBe(1);
      expect(mockAuthFilter).toHaveBeenCalledWith(
        'vf.folder_id',
        expect.any(Number)
      );
    });

    it('should handle RBAC auth filter with non-Folder resource type', async () => {
      const mockAuthFilter = jest.fn((idColumn, paramIndex) => {
        return {
          where: `${idColumn} IN (SELECT id FROM other_table)`,
          join: 'INNER JOIN other_table ot ON ot.id = vf.folder_id',
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
            folder_id: 'c_f_1',
            folder_name: 'child folder',
            folder_description: 'my child folder',
            organization_id: 7682,
            parent_folder_id: 'f_id',
            folder_type_id: 1,
            date_created: new Date(),
            date_modified: new Date(),
            tree_object_id: 'to123'
          }
        ],
        false,
        [],
        (sql, params) => {
          // Should NOT contain the RBAC filter since resource type doesn't match
          expect(sql).not.toContain('INNER JOIN other_table');
          expect(sql).not.toContain('other_table');
          expect(params[0]).toBe('f_id');
          expect(params[1]).toBe(7682);
          // Should only have folder ID and org ID params, not the auth groups
          expect(params.length).toBe(2);
          return true;
        }
      );

      const res = await dal.getSubfolders(context, {
        folderId: 'f_id',
        organizationId: 7682
      });

      expect(res).toBeDefined();
      expect(res.length).toBe(1);
    });
  });

  describe('#getParentFolders', function () {
    it('should throw error when missing organizationId', async function () {
      try {
        await dal.getParentFolders({}, {});
      } catch (e) {
        expect(e.message).toMatch(/Missing\sorganization\sid/);
      }
    });
    it('should throw error when missing objectId', async function () {
      try {
        await dal.getParentFolders({}, { organizationId: 1 });
      } catch (e) {
        expect(e.message).toMatch(/folderId\sis\srequired/);
      }
    });
    it('should get array empty when parent is null', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'f_id',
          parentFolderId: null
        }
      ]);
      const res = await dal.getParentFolders(mockUtil.makeContext(), {
        folderId: 'f_id'
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(0);
    });
    it('should get parent folders of a folder', async function () {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'f_id',
          parentFolderId: 'p_f_id'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'p_f_id',
            name: 'parent folder',
            parentFolderId: 'g_p_f_id'
          },
          {
            id: 'g_p_f_id',
            name: 'grandparent folder',
            parentFolderId: null
          }
        ],
        false,
        ['folder_path @>'],
        (sql, params) => {
          expect(params[0]).toEqual('p_f_id');
          return true;
        }
      );
      const res = await dal.getParentFolders(mockUtil.makeContext(), {
        folderId: 'f_id'
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
    });

    it('should get parent folders without org filter when using internal token', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 'f_id',
          parentFolderId: 'p_f_id'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'p_f_id',
            name: 'parent folder',
            parentFolderId: 'g_p_f_id'
          },
          {
            id: 'g_p_f_id',
            name: 'grandparent folder',
            parentFolderId: null
          }
        ],
        false,
        ['folder_path @>'],
        (sql, params) => {
          expect(sql).not.toMatch(/vf\.organization_id\s=/);
          expect(params.length).toEqual(1);
          expect(params[0]).toEqual('p_f_id');
          return true;
        }
      );
      const res = await dal.getParentFolders(context, {
        folderId: 'f_id'
      });
      expect(res).toBeDefined();
      expect(res.length).toEqual(2);
    });
  });

  describe('#getFolderOverview', function () {
    it('should throw error when missing rootFolderType', async function () {
      try {
        await dal.getFolderOverview(mockUtil.makeContext(), {});
      } catch (e) {
        expect(e.message).toMatch(/rootFolderType\sis\srequired/);
      }
    });

    it('should throw error when exceeding the folder limit', async function () {
      const maxFolders = 1000;
      try {
        await dal.getFolderOverview(mockUtil.makeContext(), {
          ids: _.range(maxFolders + 2),
          rootFolderType: 'watchlist'
        });
      } catch (e) {
        expect(e.message).toMatch(
          new RegExp(`No more than ${maxFolders} folders`)
        );
      }
    });

    it('should get folder overview for a single folder', async function () {
      const context = mockUtil.makeContext();
      const userId = 'user_123';
      _.set(context, '_authInfo.userId', userId);

      const inputArgs = {
        ids: ['f_id'],
        organizationId: 1,
        rootFolderType: 'watchlist'
      };
      const resolvedUuid = 'uuid_f_id';
      // _resolveFolderIds
      serviceContext.dbConnections['media_platform'].read._push(
        [{ folder_id: resolvedUuid, lookup_key: 'f_id' }],
        false,
        ['SELECT folder_id::text'],
        (sql, params) => {
          expect(params[0]).toEqual(expect.arrayContaining(['f_id']));
          return true;
        }
      );

      // _validateAccess - getFolderTypeByName
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: 3, name: 'watchlist' }],
        false
      );

      // _validateAccess
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: resolvedUuid, root_folder_path: '1.2' }],
        false,
        ['WITH r_f AS']
      );

      // returns a single row with aggregated counts/arrays
      const mockDbResult = {
        childFoldersCount: 5,
        childNonFolderObjectsCount: 3,
        folderIds: ['c_1', 'c_2', 'c_3', 'c_4', 'c_5'],
        objectIds: ['obj_1', 'obj_2', 'obj_3']
      };

      serviceContext.dbConnections['media_platform'].read._push(
        [mockDbResult],
        false,
        ['WITH target_roots AS'],
        (sql, params) => {
          // params: [inputV2FolderIds, organizationId, objectType]
          expect(params[0]).toEqual(expect.arrayContaining([resolvedUuid]));
          expect(params[1]).toEqual(1);
          expect(params[2]).toBeDefined();
          return true;
        }
      );

      const res = await dal.getFolderOverview(context, inputArgs);

      expect(res).toEqual({
        childFoldersCount: 5,
        childNonFolderObjectsCount: 3,
        folderIds: ['c_1', 'c_2', 'c_3', 'c_4', 'c_5'],
        objectIds: ['obj_1', 'obj_2', 'obj_3'],
        treeObjectIds: ['obj_1', 'obj_2', 'obj_3']
      });
    });

    it('should handle multiple IDs and deduplicate via SQL logic', async function () {
      const context = mockUtil.makeContext();
      _.set(context, '_authInfo.userId', 'user_123');

      const inputArgs = {
        ids: ['f_id', 'c_f_id'], // parent and child fed in simultaneously
        organizationId: 1,
        rootFolderType: 'watchlist'
      };

      const uuidParent = 'uuid_parent';
      const uuidChild = 'uuid_child';

      // resolve ids
      serviceContext.dbConnections['media_platform'].read._push(
        [
          { folder_id: uuidParent, lookup_key: 'f_id' },
          { folder_id: uuidChild, lookup_key: 'c_f_id' }
        ],
        false
      );

      // validate acces (type)
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: 3, name: 'watchlist' }],
        false
      );

      // validate access (ids)
      serviceContext.dbConnections['media_platform'].read._push(
        [
          { id: uuidParent, root_folder_path: '1' },
          { id: uuidChild, root_folder_path: '1.2' }
        ],
        false
      );

      const mockDbResult = {
        childFoldersCount: 2,
        childNonFolderObjectsCount: 1,
        folderIds: ['sub_child_1', 'sub_child_2'],
        objectIds: ['obj_unique']
      };

      serviceContext.dbConnections['media_platform'].read._push(
        [mockDbResult],
        false,
        ['WITH target_roots AS'],
        (sql, params) => {
          expect(params[0]).toHaveLength(2);
          expect(params[0]).toEqual(
            expect.arrayContaining([uuidParent, uuidChild])
          );
          return true;
        }
      );

      const res = await dal.getFolderOverview(context, inputArgs);

      expect(res).toEqual(
        expect.objectContaining({
          childFoldersCount: 2,
          childNonFolderObjectsCount: 1,
          objectIds: ['obj_unique']
        })
      );
    });

    it('should return empty structure when no IDs are resolved (or empty input)', async function () {
      const context = mockUtil.makeContext();
      const inputArgs = {
        ids: ['bad_id'],
        organizationId: 1,
        rootFolderType: 'watchlist'
      };

      serviceContext.dbConnections['media_platform'].read._push([], false);

      // stop at "if (_.isEmpty(inputV2FolderIds)) return { ... }"
      const res = await dal.getFolderOverview(context, inputArgs);

      expect(res).toEqual({
        childFoldersCount: 0,
        childNonFolderObjectsCount: 0,
        objectIds: [],
        treeObjectIds: [],
        folderIds: []
      });
    });

    it('should return empty structure on general error', async function () {
      const context = mockUtil.makeContext();
      // _resolveFolderIds
      // we must pass this step otherwise the error is swallowed
      serviceContext.dbConnections['media_platform'].read._push(
        [{ folder_id: 'uuid_f_id', lookup_key: 'f_id' }],
        false
      );

      // _validateAccess
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: 3, name: 'watchlist' }],
        false
      );
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: 'uuid_f_id', root_folder_path: '1.2' }],
        false
      );

      // this error will be caught by getFolderOverview's catch block
      serviceContext.dbConnections['media_platform'].read._push(
        new Error('Simulated Database Failure')
      );

      const res = await dal.getFolderOverview(context, {
        ids: ['f_id'],
        organizationId: 1,
        rootFolderType: 'watchlist'
      });

      expect(res).toEqual({});
    });
  });

  describe('#getFolderSummaryDetails', function () {
    it('should throw error when missing rootFolderType', async () => {
      const context = mockUtil.makeContext();
      try {
        await dal.getFolderSummaryDetails(context, {
          ids: ['f_id']
          // rootFolderType is missing
        });
        throw new Error('Expected InvalidInput error was not thrown');
      } catch (e) {
        expect(e.message).toMatch(/rootFolderType\sis\srequired/);
      }
    });

    it('should throw error when exceeding the folder limit', async () => {
      const context = mockUtil.makeContext();
      const maxFolders = 1000;

      const tooManyIds = _.range(maxFolders + 5);

      try {
        await dal.getFolderSummaryDetails(context, {
          ids: tooManyIds,
          rootFolderType: 'watchlist'
        });
        throw new Error('Expected InvalidInput error was not thrown');
      } catch (e) {
        const expectedMsg = new RegExp(
          `No more than ${maxFolders} folders for an overview`
        );
        expect(e.message).toMatch(expectedMsg);
      }
    });
    it('should get folder summary details for a folder including hierarchy', async () => {
      const context = mockUtil.makeContext();
      const organizationId = 1;
      const userId = 'user_123';
      _.set(context, '_authInfo.userId', userId);

      const inputArgs = {
        ids: ['f_id'],
        organizationId,
        rootFolderType: 'watchlist'
      };

      const resolvedUuid = 'uuid_f_id';

      // _resolveFolderIds
      serviceContext.dbConnections['media_platform'].read._push(
        [{ folder_id: resolvedUuid, lookup_key: 'f_id' }],
        false,
        ['SELECT folder_id::text'],
        (sql, params) => {
          expect(params[0]).toEqual(expect.arrayContaining(['f_id']));
          return true;
        }
      );

      // _validateAccess -> getFolderTypeByName
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: 3, name: 'watchlist' }],
        false
      );

      // _validateAccess -> Validation Query
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: resolvedUuid, root_folder_path: '1.2' }],
        false,
        ['WITH r_f AS'],
        (sql, params) => {
          const folderIdsParam = params.slice(3);
          expect(folderIdsParam).toEqual(
            expect.arrayContaining([resolvedUuid])
          );
          return true;
        }
      );

      // main query
      const mockHierarchyRows = [
        {
          object_id: resolvedUuid, // 'f_id' resolved
          parent_folder_id: null,
          child_folders_count: 1,
          child_non_folder_objects_count: 2,
          real_depth: 0,
          child_watchlists_ids: ['obj_1', 'obj_2']
        },
        {
          object_id: 'other_f_id', // a sibling or unrelated folder found by query logic
          parent_folder_id: null,
          child_folders_count: 0,
          child_non_folder_objects_count: 0,
          real_depth: 0
        },
        {
          object_id: 'c_f_id',
          parent_folder_id: resolvedUuid, // child of f_id
          child_folders_count: 0,
          child_non_folder_objects_count: 1,
          real_depth: 1,
          child_watchlists_ids: ['obj_2']
        },
        {
          object_id: 'obj_1',
          parent_folder_id: resolvedUuid, // child object of f_id
          child_folders_count: 0,
          child_non_folder_objects_count: 0,
          real_depth: 1
        },
        {
          object_id: 'obj_2',
          parent_folder_id: 'c_f_id', // child object of c_f_id
          child_folders_count: 0,
          child_non_folder_objects_count: 0,
          real_depth: 2
        }
      ];

      serviceContext.dbConnections['media_platform'].read._push(
        mockHierarchyRows,
        false,
        ['WITH target_roots AS'],
        (sql, params) => {
          expect(params[0]).toEqual(expect.arrayContaining([resolvedUuid]));
          expect(params[1]).toEqual(organizationId);
          return true;
        }
      );

      const results = await dal.getFolderSummaryDetails(context, inputArgs);

      expect(results).toHaveLength(5);

      const rootFolder = results.find((r) => r.objectId === resolvedUuid);
      expect(rootFolder).toBeDefined();
      expect(rootFolder.childFoldersCount).toEqual(1);
      expect(rootFolder.childWatchlistsIds).toEqual(['obj_1', 'obj_2']);

      const childFolder = results.find((r) => r.objectId === 'c_f_id');
      expect(childFolder).toBeDefined();
      expect(childFolder.parentFolderId).toEqual(resolvedUuid);
    });
    it('should resolve IDs, validate access, and return folder summary details', async () => {
      const context = mockUtil.makeContext();
      const organizationId = 1;
      const userId = 'user_123';
      _.set(context, '_authInfo.userId', userId);

      const inputArgs = {
        ids: ['folder_A', 'folder_B'],
        organizationId,
        rootFolderType: 'watchlist'
      };

      const resolvedUuidA = 'uuid_A';
      const resolvedUuidB = 'uuid_B';

      // _resolveFolderIds
      serviceContext.dbConnections['media_platform'].read._push(
        [
          { folder_id: resolvedUuidA, lookup_key: 'folder_A' },
          { folder_id: resolvedUuidB, lookup_key: 'folder_B' }
        ],
        false,
        ['SELECT folder_id::text'],
        (sql, params) => {
          // Verify params[0] contains provided inputs
          expect(params[0]).toEqual(
            expect.arrayContaining(['folder_A', 'folder_B'])
          );
          return true;
        }
      );

      // _validateAccess -> getFolderTypeByName
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: 3, name: 'watchlist' }],
        false
      );

      // _validateAccess -> Validation Query
      serviceContext.dbConnections['media_platform'].read._push(
        [
          { id: resolvedUuidA, root_folder_path: '1.2' },
          { id: resolvedUuidB, root_folder_path: '1.3' }
        ],
        false,
        ['WITH r_f AS'],
        (sql, params) => {
          // params: [orgId, userId, folderTypeId, ...folderIds]
          const folderIdsParam = params.slice(3);
          expect(folderIdsParam).toEqual(
            expect.arrayContaining([resolvedUuidA, resolvedUuidB])
          );
          return true;
        }
      );

      // main query
      const mockSummaryRows = [
        {
          object_id: resolvedUuidA,
          parent_folder_id: null,
          folder_type_id: 3,
          real_depth: 0,
          child_folders_count: 5,
          child_non_folder_objects_count: 2,
          child_watchlists_ids: ['obj_1', 'obj_2'],
          date_created: new Date(),
          date_modified: new Date()
        },
        {
          object_id: resolvedUuidB,
          parent_folder_id: null,
          folder_type_id: 3,
          real_depth: 0,
          child_folders_count: 0,
          child_non_folder_objects_count: 0,
          child_watchlists_ids: [],
          date_created: new Date(),
          date_modified: new Date()
        }
      ];

      serviceContext.dbConnections['media_platform'].read._push(
        mockSummaryRows,
        false,
        ['WITH target_roots AS'],
        (sql, params) => {
          expect(params[0]).toEqual(
            expect.arrayContaining([resolvedUuidA, resolvedUuidB])
          );
          expect(params[1]).toEqual(organizationId);
          return true;
        }
      );

      const results = await dal.getFolderSummaryDetails(context, inputArgs);

      expect(results).toHaveLength(2);

      const folderA = results.find((r) => r.objectId === resolvedUuidA);
      const folderB = results.find((r) => r.objectId === resolvedUuidB);

      expect(folderA).toBeDefined();
      expect(folderA.childFoldersCount).toEqual(5);
      expect(folderA.childNonFolderObjectsCount).toEqual(2);
      expect(folderA.childWatchlistsIds).toEqual(['obj_1', 'obj_2']);

      expect(folderB).toBeDefined();
      expect(folderB.childFoldersCount).toEqual(0);
    });
    it('should return empty array when no data is found', async () => {
      const context = mockUtil.makeContext();
      const organizationId = 1;
      _.set(context, '_authInfo.userId', 'user_123');

      const inputArgs = {
        ids: ['f_id', 'c_f_id', 'other_f_id'],
        organizationId,
        rootFolderType: 'watchlist'
      };

      const resolvedIds = ['uuid_1', 'uuid_2', 'uuid_3'];

      // _resolveFolderIds
      serviceContext.dbConnections['media_platform'].read._push(
        [
          { folder_id: resolvedIds[0], lookup_key: 'f_id' },
          { folder_id: resolvedIds[1], lookup_key: 'c_f_id' },
          { folder_id: resolvedIds[2], lookup_key: 'other_f_id' }
        ],
        false
      );

      // _validateAccess - getFolderTypeByName
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: 3, name: 'watchlist' }],
        false
      );

      // _validateAccess
      serviceContext.dbConnections['media_platform'].read._push(
        [
          { id: resolvedIds[0], root_folder_path: '1' },
          { id: resolvedIds[1], root_folder_path: '1.2' },
          { id: resolvedIds[2], root_folder_path: '2' }
        ],
        false
      );

      serviceContext.dbConnections['media_platform'].read._push([], false, [
        'WITH target_roots AS'
      ]);
      const res = await dal.getFolderSummaryDetails(context, inputArgs);
      expect(res).toEqual([]);
    });
    it('should return type_id for watchlist objects (watchlist type_id = 2)', async () => {
      const context = mockUtil.makeContext();
      const organizationId = 1;
      const userId = 'user_456';
      _.set(context, '_authInfo.userId', userId);

      const inputArgs = {
        ids: ['wl_folder_id'],
        organizationId,
        rootFolderType: 'watchlist'
      };

      const resolvedUuid = 'uuid_wl_folder';

      // _resolveFolderIds
      serviceContext.dbConnections['media_platform'].read._push(
        [{ folder_id: resolvedUuid, lookup_key: 'wl_folder_id' }],
        false,
        ['SELECT folder_id::text'],
        (sql, params) => {
          expect(params[0]).toEqual(expect.arrayContaining(['wl_folder_id']));
          return true;
        }
      );

      // _validateAccess -> getFolderTypeByName
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: 2, name: 'watchlist' }],
        false
      );

      // _validateAccess -> Validation Query
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: resolvedUuid, root_folder_path: '1.2' }],
        false,
        ['WITH r_f AS'],
        (sql, params) => {
          const folderIdsParam = params.slice(3);
          expect(folderIdsParam).toEqual(
            expect.arrayContaining([resolvedUuid])
          );
          return true;
        }
      );

      // main query - mock rows with type_id field
      // Folder rows have type_id as null (they come from folderSummary side of FULL JOIN)
      // Watchlist object rows have type_id = 2 (from v2_folder_type join where folder_type_name matches 'watchlist')
      const mockSummaryRows = [
        {
          object_id: resolvedUuid,
          parent_folder_id: null,
          folder_type_id: 2,
          real_depth: 0,
          child_folders_count: 1,
          child_non_folder_objects_count: 2,
          child_watchlists_ids: ['wl_obj_1', 'wl_obj_2'],
          date_created: new Date(),
          date_modified: new Date(),
          tree_object_id: 'tree_obj_1',
          type_id: 1 // folder row - no type_id from watchlistSummary
        },
        {
          object_id: 'child_folder_1',
          parent_folder_id: resolvedUuid,
          folder_type_id: 2,
          real_depth: 1,
          child_folders_count: 0,
          child_non_folder_objects_count: 1,
          child_watchlists_ids: ['wl_obj_2'],
          date_created: new Date(),
          date_modified: new Date(),
          tree_object_id: 'tree_obj_2',
          type_id: 1 // folder row
        },
        {
          object_id: 'wl_obj_1',
          parent_folder_id: resolvedUuid,
          folder_type_id: 2,
          real_depth: 1,
          child_folders_count: 0,
          child_non_folder_objects_count: 0,
          child_watchlists_ids: [],
          tracking_unit_name: 'Test Watchlist 1',
          fingerprints: null,
          tracking_unit_start_date: null,
          tracking_unit_stop_date: null,
          media_source_type_ids: null,
          track_my_programs: false,
          created_by: ['user_456'],
          market_count: 3,
          number_of_programs: 5,
          date_created: new Date(),
          date_modified: new Date(),
          tree_object_id: null,
          type_id: 2 // watchlist object - type_id from v2_folder_type
        },
        {
          object_id: 'wl_obj_2',
          parent_folder_id: 'child_folder_1',
          folder_type_id: 2,
          real_depth: 2,
          child_folders_count: 0,
          child_non_folder_objects_count: 0,
          child_watchlists_ids: [],
          tracking_unit_name: 'Test Watchlist 2',
          fingerprints: null,
          tracking_unit_start_date: null,
          tracking_unit_stop_date: null,
          media_source_type_ids: null,
          track_my_programs: true,
          created_by: [],
          market_count: 0,
          number_of_programs: 0,
          date_created: new Date(),
          date_modified: new Date(),
          tree_object_id: null,
          type_id: 2 // watchlist object - type_id from v2_folder_type
        }
      ];

      serviceContext.dbConnections['media_platform'].read._push(
        mockSummaryRows,
        false,
        ['WITH target_roots AS'],
        (sql, params) => {
          expect(params[0]).toEqual(expect.arrayContaining([resolvedUuid]));
          expect(params[1]).toEqual(organizationId);
          // Verify the SQL contains the v2_folder_type join
           expect(sql).toContain('JOIN v2_folder_type vft ON LOWER(vft.folder_type_name) = LOWER(vfo.object_type::text)');
          // Verify the SQL selects type_id
          expect(sql).toContain('vft.folder_type_id as type_id');
          expect(sql).toContain('ws.type_id');
          // Verify the object_type filter no longer uses ::type_folder_object_type cast
          expect(sql).toContain("vfo.object_type='watchlist'");
          expect(sql).not.toContain("'watchlist'::type_folder_object_type");
          return true;
        }
      );

      const results = await dal.getFolderSummaryDetails(context, inputArgs);

      expect(results).toHaveLength(4);

      // Verify folder rows have no typeId (null)
      const rootFolder = results.find((r) => r.objectId === resolvedUuid);
      expect(rootFolder).toBeDefined();
       expect(rootFolder.typeId).toEqual(1);
      expect(rootFolder.childFoldersCount).toEqual(1);
      expect(rootFolder.childNonFolderObjectsCount).toEqual(2);
      expect(rootFolder.treeObjectId).toEqual('tree_obj_1');

      const childFolder = results.find((r) => r.objectId === 'child_folder_1');
      expect(childFolder).toBeDefined();
       expect(childFolder.typeId).toEqual(1);
      expect(childFolder.parentFolderId).toEqual(resolvedUuid);

      // Verify watchlist object rows have typeId = 2
      const watchlist1 = results.find((r) => r.objectId === 'wl_obj_1');
      expect(watchlist1).toBeDefined();
      expect(watchlist1.typeId).toEqual(2);
      expect(watchlist1.trackingUnitName).toEqual('Test Watchlist 1');
      expect(watchlist1.marketCount).toEqual(3);
      expect(watchlist1.numberOfPrograms).toEqual(5);
      expect(watchlist1.folderTypeId).toEqual(2);

      const watchlist2 = results.find((r) => r.objectId === 'wl_obj_2');
      expect(watchlist2).toBeDefined();
      expect(watchlist2.typeId).toEqual(2);
      expect(watchlist2.trackMyPrograms).toEqual(true);
      expect(watchlist2.parentFolderId).toEqual('child_folder_1');
    });
  });

  describe('#shareFolder', () => {
    let context;
    beforeEach(() => {
      context = mockUtil.makeContext();
      serviceContext.logger.error = jest.fn();
    });
    it('should error if missing folderId', async () => {
      try {
        await dal.shareFolder(context, {
          input: {},
          organizationId: 1234
        });
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
    it('should error if no folder updated', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        { id: '57600f00-8152-4d12-8d48-8a7364dde01f' }
      ]);
      serviceContext.dbConnections['media_platform'].write._push([]);
      try {
        await dal.shareFolder(context, {
          input: {
            treeObjectId: '57600f00-8152-4d12-8d48-8a7364dde01f'
          },
          organizationId: 1234
        });
      } catch (e) {
        expect(e).toBeDefined();
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
          id: '1', organization_id: 1
        },
        {
          id: '2', organization_id: 2
        }
      ]);
      try {
        await dal.shareFolder(mockUtil.makeContext(), {
          input: {
            treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682,
            readOrganizationIds: [1, 2, 9999],
            writeOrganizationIds: [2, 8888],
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    });
    it('should throw if both read/write orgs are empty', async () => {
      serviceContext.dbConnections['media_platform'].write._push([
        {
          tree_object_id: '2ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);      
      try {
        await dal.shareFolder(mockUtil.makeContext(), {
          input: {
            treeObjectId: '2ace46d4-9e27-4fea-9623-75231ff21195',
            organizationId: 7682,
            readOrganizationIds: [],
            writeOrganizationIds: [],
          }
        });
        expect.fail('no throw');
      } catch (err) {
        expect(err.name).toBe('invalid_input');
      }
    })
    it('should share folder successfully', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [{ id: '57600f00-8152-4d12-8d48-8a7364dde01f' }],
        false
      );
      serviceContext.dbConnections['media_platform'].write._push([
        {
          folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195'
        }
      ]);

      serviceContext.dbConnections['media_platform'].read._push([
        {
          folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
          folder_type_id: 1,
          organization_id: 12345,
          folder_name: '---folder_name---',
          folder_description: 'Unit test folder',
          parent_folder_id: 11111,
          shared_org_read: 0,
          shared_org_write: 0,
          folder_path: '---folder_path---'
        }
      ]);
      try {
        await dal.shareFolder(context, {
          input: {
            treeObjectId: '57600f00-8152-4d12-8d48-8a7364dde01f',
            readOrganizationIds: [1234, 2345],
            writeOrganizationIds: [1234, 2345]
          },
          organizationId: 1234
        });
      } catch (e) {
        expect(e).toBeDefined();
      }
      expect(serviceContext.logger.error).not.toHaveBeenCalled();
    });
  });
  describe('#getSharedFolders', () => {
    let context;
    beforeEach(() => {
      context = mockUtil.makeContext();
      serviceContext.logger.error = jest.fn();
    });
    it('should error if missing organizationId', async () => {
      try {
        await dal.getSharedFolders(context, {});
      } catch (e) {
        expect(e).toBeDefined();
      }
      expect(serviceContext.logger.error).toHaveBeenCalled();
    });
    it('should get shared folder successfully', async () => {
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195',
            folder_type_id: 1,
            organization_id: 12345,
            folder_name: '---folder_name---',
            folder_description: 'Unit test folder',
            parent_folder_id: 11111,
            shared_org_read: 0,
            shared_org_write: 0,
            folder_path: '---folder_path---'
          }
        ],
        false
      );
      let res, err;
      try {
        res = await dal.getSharedFolders(context, {
          organizationId: 1234
        });
      } catch (e) {
        err = e;
      }
      expect(serviceContext.logger.error).not.toHaveBeenCalled();
      expect(res).toBeDefined();
      expect(res.length).toEqual(1);
      expect(err).toBeUndefined();
    });
  });

  describe('#getFolderById', function () {
    it('should get folder by id without org filter when using internal token', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'ae5f28eb-e10b-45df-9318-8f2b9e372d1d',
            folderTypeId: 2,
            name: 'parent-folder'
          }
        ],
        false,
        ['folder_path @>'],
        (sql, params) => {
          expect(sql).not.toMatch(/vf\.organization_id\s=/);
          expect(params.length).toEqual(1);
          expect(params[0]).toEqual('p_f_id');
          return true;
        }
      );

      const res = await dal.getParentFolder(context, {
        folderId: 'f_id'
      });
      expect(res).toBeDefined();
    });
    it('should get folder by id with org filter when using external token', async function () {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'ae5f28eb-e10b-45df-9318-8f2b9e372d1d',
            folderTypeId: 2,
            name: 'parent-folder'
          }
        ],
        false,
        ['folder_path @>'],
        (sql, params) => {
          expect(sql).toMatch(/vf\.organization_id\s=/);
          expect(sql).not.toMatch(/vf\.organization_id\s=/);
          expect(params.length).toEqual(2);
          return true;
        }
      );

      const res = await dal.getParentFolder(context, {
        folderId: 'f_id'
      });

      expect(res).toBeDefined();
    });
  });
  describe('#getFolderByTreeObjectId', function () {
    it('should get folder by treeObjectId without org filter when using internal token', async function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'ae5f28eb-e10b-45df-9318-8f2b9e372d1d',
            folderTypeId: 2,
            name: 'parent-folder'
          }
        ],
        false,
        ['folder_path @>'],
        (sql, params) => {
          expect(sql).not.toMatch(/vf\.organization_id\s=/);
          expect(params.length).toEqual(1);
          expect(params[0]).toEqual('p_f_id');
          return true;
        }
      );

      const res = await dal.getParentFolder(context, {
        folderId: 'f_id'
      });
      expect(res).toBeDefined();
    });
    it('should get folder by treeObjectId with org filter when using external token', async function () {
      const context = mockUtil.makeContext();
      serviceContext.dbConnections['media_platform'].read._push(
        [
          {
            id: 'ae5f28eb-e10b-45df-9318-8f2b9e372d1d',
            folderTypeId: 2,
            name: 'parent-folder'
          }
        ],
        false,
        ['folder_path @>'],
        (sql, params) => {
          expect(sql).toMatch(/vf\.organization_id\s=/);
          expect(params.length).toEqual(2);
          return true;
        }
      );

      const res = await dal.getParentFolder(context, {
        folderId: 'f_id'
      });

      expect(res).toBeDefined();
    });
  });

  describe('#_getOrganizationId', function () {
    it('should return organizationId from args.input.organizationId if internal token', function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      const args = {
        input: {
          organizationId: 'orgIdFromArgsInput'
        }
      };

      const result = dal._getOrganizationId(context, args);
      expect(result).toEqual('orgIdFromArgsInput');
    });

    it('should return organizationId from args.organizationId if internal token and no input.organizationId', function () {
      const context = mockUtil.makeContext({ authType: 'api_internal' });
      const args = {
        organizationId: 'orgIdFromArgs'
      };
      const result = dal._getOrganizationId(context, args);
      expect(result).toEqual('orgIdFromArgs');
    });

    it('should throw InvalidInput if not internal token and no orgId in args or context', function () {
      const context = { _authInfo: {} };
      const args = {};
      expect(() => dal._getOrganizationId(context, args)).toThrowError(
        expect.objectContaining({
          message: 'Missing organization id'
        })
      );
    });

    it('should return organizationId from args.input.organizationId if not internal token', function () {
      const context = mockUtil.makeContext({
        organization: { organizationId: 'orgIdFromRequestor' }
      });
      const args = {
        input: {
          organizationId: 'orgIdFromArgsInput'
        }
      };
      const result = dal._getOrganizationId(context, args);
      expect(result).toEqual('orgIdFromArgsInput');
    });
  });

  describe('#getUserRootFolders', () => {
    const ctx = mockUtil.makeContext();
    it('should return empty array when organizationId is not provided', async () => {
      const result = await dal.getUserRootFolders(null, null);
      expect(result).toEqual([]);
    });

    it('should return user root folders for organization', async () => {
      // getFolderTypeByName - getFolderTypes
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'CMS'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          { folder_id: 'folder-1', root_folder_user_id: 'user-1' },
          { folder_id: 'folder-2', root_folder_user_id: 'user-2' }
        ],
        false,
        ['vfr.root_folder_user_id', 'vf.folder_type_id'],
        (sql, params) => {
          expect(params[0]).toBe(5); // folderTypeId
          expect(params[1]).toEqual(7682);
          return true;
        }
      );

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
      // getFolderTypeByName - getFolderTypes
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'CMS'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push(
        [
          { folder_id: 'folder-1', root_folder_user_id: 'user-1' },
          { folder_id: 'folder-2', root_folder_user_id: 'user-2' }
        ],
        false,
        ['vfr.root_folder_user_id', 'vf.folder_type_id'],
        (sql, params) => {
          expect(sql).toMatch(
            /LEFT JOIN rbac_folders _rbac_f ON _rbac_f\.folder_id = vfr\.folder_id/
          );
          expect(sql).toMatch(/_rbac_f\.folder_id IS NULL/);
          expect(params[0]).toEqual(5); // root folder type id for 'cms'
          expect(params[1]).toEqual(7682);
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

    it('should return empty array when no folders found', async () => {
      serviceContext.dbConnections['media_platform'].read._push([
        {
          id: 5,
          name: 'CMS'
        }
      ]);
      serviceContext.dbConnections['media_platform'].read._push([]);

      const result = await dal.getUserRootFolders(7682, 500, 0);

      expect(result).toEqual([]);
    });
  });
  describe('#buildRootFolderName', function () {
    it('should build org root folder name without v1Output', async function () {
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 1,
        name: 'Test Org'
      });

      const name = await dal.buildRootFolderName({
        context: mockUtil.makeContext(),
        args: { folderType: 'cms', organizationId: 1 }
      });

      expect(name).toEqual('Test Org cms Root Folder');
    });
    it('should build user root folder name', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396',
          user_name: 'Test User'
        }
      ]);

      const name = await dal.buildRootFolderName({
        context: mockUtil.makeContext(),
        args: {
          folderType: 'cms',
          organizationId: 1,
          rootFolderUserId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        },
        v1Output: null
      });

      expect(name).toEqual('Test User cms Root Folder');
    });
    it('should build org root folder name', async function () {
      serviceContext.dal.organization.getOrganization.mockReturnValue({
        organizationId: 7682,
        name: 'Test Org'
      });

      const name = await dal.buildRootFolderName({
        context: mockUtil.makeContext(),
        args: {
          folderType: 'cms',
          organizationId: 1
        },
        v1Output: null
      });

      expect(name).toEqual('Test Org cms Root Folder');
    });
    it('should fallback when userName not found', async function () {
      serviceContext.dbConnections['sso'].read._push([
        {
          user_id: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        }
      ]);

      const name = await dal.buildRootFolderName({
        context: mockUtil.makeContext(),
        args: {
          folderType: 'cms',
          organizationId: 1,
          rootFolderUserId: '513e96ec-2bea-49a5-9d98-dc74ac19b396'
        },
        v1Output: null
      });

      expect(name).toEqual('User cms Root Folder');
    });
  });

  describe('#validateCreateFolderInput — name and description trimming', function () {
    const FOLDER_TYPES_ROW = {
      id: 1,
      name: 'cms',
      image: '',
      description: 'Folder desc',
      contentTemplateSchemaId: 'd3ea1e72-9356-4910-adad-ac6f4e5524c2',
      organizationId: 1
    };

    function pushFolderTypes() {
      serviceContext.dbConnections['media_platform'].read._push(
        [FOLDER_TYPES_ROW],
        false
      );
    }

    describe('folderName', function () {
      const folderName = 'My Folder'
      it('should trim both sides of name', async function () {
        const context = mockUtil.makeContext();
        pushFolderTypes();
        const result = await dal.validateCreateFolderInput(context, {
          input: { name: `   ${folderName}   `, description: 'desc' }
        });
        expect(result.folderName).toEqual('My Folder');
      });

      it('should preserve name with no padding', async function () {
        const context = mockUtil.makeContext();
        pushFolderTypes();
        const result = await dal.validateCreateFolderInput(context, {
          input: { name: folderName, description: 'desc' }
        });
        expect(result.folderName).toEqual('My Folder');
      });
    });

    describe('folderDescription', function () {
      it('should preserve description with padding intact (parity with V1)', async function () {
        const context = mockUtil.makeContext();
        pushFolderTypes();
        const result = await dal.validateCreateFolderInput(context, {
          input: { name: 'folder', description: '  Some description  ' }
        });
        expect(result.folderDescription).toEqual('  Some description  ');
      });

      it('should default to empty string when description is undefined', async function () {
        const context = mockUtil.makeContext();
        pushFolderTypes();
        const result = await dal.validateCreateFolderInput(context, {
          input: { name: 'folder' }
        });
        expect(result.folderDescription).toEqual('');
      });
    });
  });

  describe('#getRootFolderUserIdByFolderId', function () {
    it('should return root_folder_user_id when folder exists', async function () {
      const folderId = '35ec62c5-6215-4d64-a8ee-0cb4dc21b47b';
      const expectedUserId = 'user-uuid-123';
      serviceContext.dbConnections['media_platform'].read._push(
        [{ root_folder_user_id: expectedUserId }],
        false
      );
      const result = await dal.getRootFolderUserIdByFolderId(folderId);
      expect(result).toEqual(expectedUserId);
    });

    it('should return null when folder does not exist', async function () {
      const folderId = '35ec62c5-6215-4d64-a8ee-0cb4dc21b47b';
      serviceContext.dbConnections['media_platform'].read._push(
        [],
        false
      );
      const result = await dal.getRootFolderUserIdByFolderId(folderId);
      expect(result).toBeNull();
    });

    it('should return null when db throws an error', async function () {
      const folderId = '35ec62c5-6215-4d64-a8ee-0cb4dc21b47b';
      serviceContext.dbConnections['media_platform'].read._push(
        new Error('db error'),
        true
      );
      const result = await dal.getRootFolderUserIdByFolderId(folderId);
      expect(result).toBeNull();
    });
  });

  describe('folder object type normalization', function () {
    // TREE_OBJECT_TYPE ids are UNDEFINED=0 FOLDER=1 WATCHLIST=2 COLLECTION=3
    // ROOT_FOLDER=4 TDO=5 APPLICATION=6, but type_folder_object_type only has
    // ('watchlist','collection','tdo','application'). The unmappable ids must
    // raise rather than normalize to undefined: addSqlWhere skips nil values,
    // so a dropped object_type silently produces an unpruned scan across all
    // 20 v2_folder_object partitions instead of a single-partition lookup.
    const unsupported = [
      [1, 'FOLDER'],
      [4, 'ROOT_FOLDER'],
      ['folder', 'the string "folder"'],
      ['bogus', 'an unknown label']
    ];

    unsupported.forEach(function (testCase) {
      const objectType = testCase[0];
      const label = testCase[1];

      it(`rejects ${label} in getParentFolder`, async function () {
        await expect(
          dal.getParentFolder('---object_id---', 12345, objectType)
        ).rejects.toThrow(/Unsupported folder object type/);
      });

      it(`rejects ${label} in getParentFoldersForObject`, async function () {
        await expect(
          dal.getParentFoldersForObject('---object_id---', 12345, objectType)
        ).rejects.toThrow(/Unsupported folder object type/);
      });
    });

    const supported = [
      [5, 'tdo'],
      [2, 'watchlist'],
      [3, 'collection'],
      [6, 'application'],
      ['tdo', 'tdo'],
      ['collection', 'collection']
    ];

    supported.forEach(function (testCase) {
      const objectType = testCase[0];
      const expected = testCase[1];

      it(`maps ${JSON.stringify(objectType)} to "${expected}"`, async function () {
        let seen;
        serviceContext.dbConnections['media_platform'].read._push(
          [{ folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195' }],
          false,
          [],
          (sql, args) => {
            seen = { sql, args };
            return true;
          }
        );

        await dal.getParentFolder('---object_id---', 12345, objectType);

        expect(seen.sql).toContain('vfo.object_type');
        expect(seen.args).toContain(expected);
      });
    });

    it('still allows omitting objectType', async function () {
      let seen;
      serviceContext.dbConnections['media_platform'].read._push(
        [{ folder_id: '1ace46d4-9e27-4fea-9623-75231ff21195' }],
        false,
        [],
        (sql, args) => {
          seen = { sql, args };
          return true;
        }
      );

      await dal.getParentFolder('---object_id---', 12345);

      expect(seen.sql).not.toContain('object_type');
      expect(seen.args).toEqual(['---object_id---', 12345]);
    });
  });

});
function mockForValidateAccess(
  folderNumber,
  folderTypes = [],
  isShared = false
) {
  if (folderTypes.length) {
    // since getFoldeTypes caches values on the first call
    // should mock all expected types in this call if using getFoldeTypes multiple in a test case
    serviceContext.dbConnections['media_platform'].read._push(
      _.map(folderTypes, (type, index) => ({ id: index, name: type })),
      false
    );
  }
  const folders = _.range(folderNumber);
  const sqlMatching = ['folder_path <@'];
  if (isShared) {
    sqlMatching.push(
      'shared_f',
      'vf.shared_org_read @>',
      'vf.shared_org_write @>'
    );
  }
  serviceContext.dbConnections['media_platform'].read._push(
    _.map(folders, (id) => ({ id: `folder_${id}` })),
    false,
    sqlMatching,
    (sql, params) => {
      expect(params.length).toEqual(3 + folderNumber);
      expect(params[0]).toEqual(expect.any(Number)); // orgId
      expect(params[1]).toEqual(expect.any(String)); // userId
      expect(params[2]).toEqual(expect.any(Number)); // mock folderTypeId

      return true;
    }
  );
}

function mockForValidateFolderId(folderId) {
  // _validateFolderId --> get folder
  serviceContext.dbConnections['media_platform'].read._push(
    [
      {
        id: folderId || 'folder_id',
        name: 'folder name'
      }
    ],
    false
  );
}
