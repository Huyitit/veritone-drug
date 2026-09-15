const _ = require('lodash');
const funcPerms = require('@veritone/functional-permissions-lib');
module.exports = function createFunction(serviceContext) {
  function getPermissionMask(permissionArray) {
    return funcPerms.rbacUtil.getPermissionMask(permissionArray);
  }

  function getPermissionMaskFromEnums(permEnumArr) {
    if (!Array.isArray(permEnumArr)) {
      return [];
    }

    return getPermissionMask(mapPermissionKeyByEnums(permEnumArr));
  }

  function permissionMaskToBuffer(permissionMask) {
    return funcPerms.rbacUtil.permissionMaskToBuffer(permissionMask);
  }

  function binaryStringToPermissionMask(binaryString) {
    return funcPerms.rbacUtil.binaryStringToPermissionMask(binaryString);
  }

  function permissionMaskToKeys(permissions, preferAiwareKeys) {
    return funcPerms.rbacUtil.permissionMaskToKeys(
      permissions,
      preferAiwareKeys
    );
  }

  function hasPermissions(permissionMask, permissions, requireAll) {
    return funcPerms.rbacUtil.hasPermissions(
      permissionMask,
      permissions,
      requireAll
    );
  }

  function isPermissionSubset(permissions, subset) {
    const mask = combinePermissionMasks(
      permissions.map((p) => p.permissionMask),
      'AND'
    );
    const subsetMask = combinePermissionMasks(
      subset.map((p) => p.permissionMask),
      'OR'
    );
    return permissionMaskIsEqual(
      mask,
      combinePermissionMasks([subsetMask, mask], 'OR')
    );
  }

  function combinePermissionMasks(permissionMasks, operation) {
    if (permissionMasks.length <= 1) {
      return permissionMasks.length ? permissionMasks[0] : [];
    }
    const andOp = _.toLower(operation) === 'and';
    let i = 0;
    let done = true;
    const result = [];
    do {
      done = true;
      let acc = permissionMasks[0][i];
      for (const m of permissionMasks) {
        let val = 0;
        if (m.length > i) {
          val = m[i];
          done = false;
        }
        acc = andOp ? (acc &= val) : (acc |= val);
      }
      if (!done) {
        result.push(acc);
      }
      i++;
    } while (!done);
    return result;
  }

  function permissionMaskIsEqual(a, b) {
    if (a.length !== b.length) {
      let s = a;
      let l = b;
      if (s.length > l.length) {
        s = b;
        l = a;
      }
      // check if the extra permissions are all 0.
      for (let i = s.length; i < l.length; i++) {
        if (l[i] !== 0) {
          return false;
        }
      }
      a = s;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  // Ex: convert ADMIN_CREATE_APPLICATION_JWT enum to admin.create_application_jwt
  function mapPermissionKeyByEnums(enums) {
    return funcPerms.rbacUtil.mapPermissionKeyByEnums(enums);
  }

  // Ex: convert admin.create_application_jwt to ADMIN_CREATE_APPLICATION_JWT
  function mapPermissionEnumByKeys(keys) {
    return funcPerms.rbacUtil.mapPermissionEnumByKeys(keys);
  }

  function getHighestPermissionBit() {
    return funcPerms.rbacUtil.getHighestPermissionBit();
  }

  function buildPermissionSql(field, permissions, requireAll) {
    return funcPerms.rbacUtil.buildPermissionSql(
      field,
      permissions,
      requireAll
    );
  }

  return {
    getPermissionMask,
    getPermissionMaskFromEnums,
    permissionMaskToBuffer,
    binaryStringToPermissionMask,
    permissionMaskToKeys,
    hasPermissions,
    mapPermissionKeyByEnums,
    mapPermissionEnumByKeys,
    getHighestPermissionBit,
    buildPermissionSql,
    isPermissionSubset,
    combinePermissionMasks,
    permissionMaskIsEqual
  };
};
