const createServiceContext = require('../../../test/serviceContext.mock.js');
const _ = require('lodash');
describe('RBAC DAL functional permissions util', () => {
  let dal;
  let serviceContext;
  beforeAll(() => {
    serviceContext = createServiceContext();
    dal = require('./functionalPermissionsUtil.dal.js')(serviceContext);
  });

  const permissions = [
    'AIWARE_FOLDER_READ',
    'AIWARE_TDO_UPDATE',
    'ADMIN_ORG_READ',
    'RECORDING_DELETE'
  ];
  let permissionKeys;
  it('mapPermissionKeyByEnums', () => {
    permissionKeys = dal.mapPermissionKeyByEnums(permissions);
    expect(permissionKeys).toEqual([
      'aiware.folder.read',
      'aiware.tdo.update',
      'admin.org.read',
      'recording.delete'
    ]);
  });
  let permissionMask;
  it('getPermissionMask', () => {
    permissionMask = dal.getPermissionMask(permissionKeys);
    expect(permissionMask).toEqual([65544, 32, 4194304]);
  });

  it('getPermissionMaskFromEnums', () => {
    permissionMask = dal.getPermissionMaskFromEnums(permissions);
    expect(permissionMask).toEqual([65544, 32, 4194304]);
  });

  function enumToMask(permEnumArr) {
    return dal.getPermissionMask(dal.mapPermissionKeyByEnums(permEnumArr));
  }

  it('permissionMaskIsEqual', () => {
    expect(
      dal.permissionMaskIsEqual(enumToMask(permissions), permissionMask)
    ).toEqual(true);
    expect(
      dal.permissionMaskIsEqual(
        enumToMask([
          'AIWARE_FOLDER_READ',
          'AIWARE_TDO_UPDATE',
          'ADMIN_ORG_READ'
        ]),
        permissionMask
      )
    ).toEqual(false);
    expect(
      dal.permissionMaskIsEqual(
        enumToMask([
          'AIWARE_FOLDER_READ',
          'AIWARE_TDO_UPDATE',
          'ADMIN_ORG_READ',
          'RECORDING_DELETE',
          'AIWARE_SDO_READ'
        ]),
        permissionMask
      )
    ).toEqual(false);
  });

  describe('combinePermissionMasks', () => {
    it('edge cases', () => {
      const a = enumToMask(['AIWARE_TDO_READ', 'AIWARE_FOLDER_READ']);
      let r = dal.combinePermissionMasks([a], 'or');
      expect(dal.permissionMaskIsEqual(a, r)).toEqual(true);
      r = dal.combinePermissionMasks([a], 'and');
      expect(dal.permissionMaskIsEqual(a, r)).toEqual(true);
    });

    it('OR', () => {
      const a = enumToMask(['AIWARE_TDO_READ', 'AIWARE_FOLDER_READ']);
      const b = enumToMask(['AIWARE_TDO_UPDATE', 'AIWARE_FOLDER_UPDATE']);
      let c = dal.combinePermissionMasks([a, b], 'or');
      const r = enumToMask([
        'AIWARE_TDO_READ',
        'AIWARE_FOLDER_READ',
        'AIWARE_TDO_UPDATE',
        'AIWARE_FOLDER_UPDATE'
      ]);
      expect(dal.permissionMaskIsEqual(c, r)).toEqual(true);
      c = dal.combinePermissionMasks([a, b, c], 'or');
      expect(dal.permissionMaskIsEqual(c, r)).toEqual(true);
    });
    it('AND', () => {
      const a = enumToMask(['AIWARE_TDO_READ', 'AIWARE_FOLDER_READ']);
      const b = enumToMask(['AIWARE_TDO_UPDATE', 'AIWARE_FOLDER_UPDATE']);
      let r = dal.combinePermissionMasks([a, b], 'and');
      expect(dal.permissionMaskIsEqual(r, [])).toEqual(true);

      r = dal.combinePermissionMasks([a, a], 'and');
      expect(dal.permissionMaskIsEqual(r, a)).toEqual(true);
      r = dal.combinePermissionMasks([b, b], 'and');
      expect(dal.permissionMaskIsEqual(r, b)).toEqual(true);
      const c = enumToMask(['AIWARE_TDO_READ', 'AIWARE_FOLDER_UPDATE']);
      r = dal.combinePermissionMasks([a, c], 'and');
      expect(
        dal.permissionMaskIsEqual(r, enumToMask(['AIWARE_TDO_READ']))
      ).toEqual(true);
      r = dal.combinePermissionMasks([b, c], 'and');
      expect(
        dal.permissionMaskIsEqual(r, enumToMask(['AIWARE_FOLDER_UPDATE']))
      ).toEqual(true);
      r = dal.combinePermissionMasks([a, b, c], 'and');
      expect(dal.permissionMaskIsEqual(r, [])).toEqual(true);
    });
  });

  describe('isPermissionSubset', () => {
    function enumToPermissionSet(perms) {
      return { permissionMask: enumToMask(perms) };
    }
    it('single match', () => {
      expect(
        dal.isPermissionSubset(
          [enumToPermissionSet(['ADMIN_ORG_READ'])],
          [enumToPermissionSet(['ADMIN_ORG_READ'])]
        )
      ).toEqual(true);
    });
    it('single not match', () => {
      expect(
        dal.isPermissionSubset(
          [enumToPermissionSet(['AIWARE_TDO_READ'])],
          [enumToPermissionSet(['AIWARE_TDO_UPDATE'])]
        )
      ).toEqual(false);
    });
    it('single subset in single set', () => {
      expect(
        dal.isPermissionSubset(
          [enumToPermissionSet(['AIWARE_TDO_READ', 'AIWARE_TDO_UPDATE'])],
          [enumToPermissionSet(['AIWARE_TDO_UPDATE'])]
        )
      ).toEqual(true);
    });
    it('multiple subsets in single set', () => {
      expect(
        dal.isPermissionSubset(
          [
            enumToPermissionSet([
              'AIWARE_TDO_READ',
              'AIWARE_TDO_UPDATE',
              'AIWARE_TDO_DELETE'
            ])
          ],
          [
            enumToPermissionSet(['AIWARE_TDO_READ']),
            enumToPermissionSet(['AIWARE_TDO_UPDATE']),
            enumToPermissionSet(['AIWARE_TDO_DELETE'])
          ]
        )
      ).toEqual(true);
      expect(
        dal.isPermissionSubset(
          [enumToPermissionSet(['AIWARE_TDO_READ', 'AIWARE_TDO_UPDATE'])],
          [
            enumToPermissionSet(['AIWARE_TDO_READ']),
            enumToPermissionSet(['AIWARE_TDO_UPDATE']),
            enumToPermissionSet(['AIWARE_TDO_DELETE'])
          ]
        )
      ).toEqual(false);
    });
    it('multiple subsets in multiple sets', () => {
      expect(
        dal.isPermissionSubset(
          [
            enumToPermissionSet(['AIWARE_TDO_READ', 'AIWARE_TDO_UPDATE']),
            enumToPermissionSet(['AIWARE_TDO_READ', 'AIWARE_TDO_UPDATE'])
          ],
          [
            enumToPermissionSet(['AIWARE_TDO_READ']),
            enumToPermissionSet(['AIWARE_TDO_UPDATE'])
          ]
        )
      ).toEqual(true);
      expect(
        dal.isPermissionSubset(
          [
            enumToPermissionSet(['AIWARE_TDO_READ', 'AIWARE_TDO_UPDATE']),
            enumToPermissionSet(['AIWARE_TDO_READ'])
          ],
          [
            enumToPermissionSet(['AIWARE_TDO_READ']),
            enumToPermissionSet(['AIWARE_TDO_UPDATE'])
          ]
        )
      ).toEqual(false);
    });
  });
});
