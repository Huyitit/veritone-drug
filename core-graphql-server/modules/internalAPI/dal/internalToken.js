const _ = require('lodash');
const crypto = require('crypto');
const moment = require('moment');
const fpl = require('@veritone/functional-permissions-lib');
const validator = require('validator');
const { v4: uuidv4 } = require('uuid');

module.exports = function createFunction(serviceContext) {
  const config = serviceContext.config;
  const errors = require('../../../error')(config);
  const mainUtil = require('../../../util.js')(serviceContext);
  const resUtil = require('../../../resolvers/util.js')(serviceContext);
  const dbRead = _.get(serviceContext, 'dbConnections.sso.read');
  const dbWrite = _.get(serviceContext, 'dbConnections.sso.write');

  const MAX_TAG_LENGTH = 32;
  const MAX_LABEL_LENGTH = 256;
  const DEFAULT_TOKEN_LENGTH = 80;

  // internal tokens cannot be given certain rights, such as superadmin
  const bannedRights = _.get(config, 'internalToken.bannedRights', [
    'superadmin',
    'veritone.superadmin',
    'veritone.financeadmin'
  ]);

  async function getInternalTokens(context, args) {
    const where = [];
    const values = [];

    let statusClause = null;
    // status filter is a little complicated because it depends
    // on two different fields within the JSON column (to be
    // compatible with existing auth code in core-admin-server)
    if (args.status) {
      const list = _.isArray(args.status) ? args.status : [args.status];
      const clauses = [];
      list.forEach((status) => {
        switch (status) {
          case 'pending':
            clauses.push(`("json"->>'isPending')::boolean IS true`);
            break;
          case 'active':
            clauses.push(
              `("json"->>'isPending' IS NULL AND ("json"->>'isRevoked')::boolean IS false)`
            );
            break;
          case 'revoked':
            clauses.push(
              `("json"->>'isPending' IS NULL AND ("json"->>'isRevoked')::boolean IS true)`
            );
            break;
          case 'updatePending':
            clauses.push(
              `(("json"->>'isPending')::boolean IS true AND ("json"->>'isRevoked')::boolean IS false)`
            );
            break;
          default:
        }
      });
      // error out if the query included status:[] as it's an ambiguous input.
      // (did the caller mean all tokens or none?)
      if (clauses.length) statusClause = '(' + clauses.join(' OR ') + ')';
      else
        throw new errors.InvalidInput({
          message:
            'If the status parameter is set on the internalTokens query ' +
            'then at least one status value must be applied. The supplied ' +
            'list was empty.'
        });
    }

    mainUtil.addSqlWhere('token_id', args.id, where, values);
    // internal tokens are always org-less with null application and group IDs.
    where.push('application_id IS NULL');
    where.push('group_id IS NULL');
    if (statusClause) where.push(statusClause);

    if (args.requestId) {
      values.push(args.requestId);
      where.push(`("json"->>'requestId')::TEXT = \$${values.length}`);
    }
    // currently only order by token id is supported
    const orderColumnMap = {
      id: 'token_id'
    };
    const orderColumnIn = args.orderBy || 'id';
    const orderColumn = orderColumnMap[orderColumnIn] || 'token_id';

    const sql = `
SELECT
   token_id AS id,
   json
FROM
  sso_token
WHERE
  ${where.join(' AND ')}
ORDER BY ${orderColumn} ${args.orderDirection === 'asc' ? 'ASC' : 'DESC'}
OFFSET ${args.offset || 0}
LIMIT ${args.limit || 30}
    `;

    const res = await dbRead.map(sql, values, mapToken);

    return mainUtil.toPage(args, res);
  }

  function mapToken(row) {
    // obscures IDs if so configured
    const obscureIds = _.get(config, 'internalToken.obscureIds', true);
    return mapTokenImpl(row, obscureIds);
  }

  function mapNewToken(row) {
    // does not obscure IDs -- used to return token on initial request
    return mapTokenImpl(row, false);
  }

  function mapTokenImpl(row, obscureId) {
    const res = {
      rights: _.get(
        row,
        'json.rights',
        _.get(row, 'json.requested_rights', [])
      ),
      label: _.get(row, 'json.tokenLabel', ''),
      id: obscureId ? obscureToken(row.id) : row.id,
      ___id: row.id, // for use internal to this code
      isRevoked: _.get(row, 'json.isRevoked', false),
      tag: row.id.substring(0, row.id.indexOf(':')),
      status: getTokenState(row),
      requestId: _.get(row, 'json.requestId'),
      json: row.json
    };
    return res;
  }

  async function getInternalToken(context, args) {
    if (!(args.id || args.requestId)) throw new Error('id is required'); // programming error
    const res = await getInternalTokens(context, args);
    if (!res.count) {
      throw new errors.NotFound({
        message: 'The requested token was not found',
        data: {
          objectType: 'InternalToken',
          objectId: obscureToken(args.id)
        }
      });
    }
    return res.records[0];
  }

  // extracts and returns the "tag" (first, label part before the :)
  // of a token. if there is no tag, returns empty string.
  function getTokenTag(token) {
    return mainUtil.getTokenTag(token);
  }

  // generates a shortened and obscured version of a token.
  // returns empty string or entire token for super-short tokens.
  function obscureToken(token) {
    return mainUtil.obscureToken(token);
  }

  // generates a long, random, cryptographically sound token
  function generateToken(tag) {
    const length = _.get(config, 'tokenLength', DEFAULT_TOKEN_LENGTH);
    // note that the length of the hex string will be double
    // the number of bytes we generate.
    return (
      tag + ':' + crypto.randomBytes(Math.floor(length / 2)).toString('hex')
    );
  }

  // throws error on any validation failure
  function validateRights(rights, context) {
    // first normalize rights to use only '.' as delimiter
    const mapped = rights.map((r) => r.replace(':', '.'));
    // now get list of extra-functionPermissionLib permissions configured
    // on Scopes directive
    const extraPerms = _.get(
      serviceContext.config,
      'directiveValidation.scopes.additionalRights',
      []
    );
    // for each requested permission, validate that it's recognized
    // either in functional-permissions-lib or our own list
    mapped.forEach((perm) => {
      const val = _.get(fpl.permissions, perm);
      if (isNaN(val) && !extraPerms.includes(perm)) {
        throw new errors.InvalidInput({
          message:
            'The list of rights requested contains an invalid entry. ' +
            'Rights can be specified using . or : delimiters. See the ' +
            'availableRights entry in the data section of this error payload ' +
            'for the complete list of rights that can be applied to a token.',
          data: {
            right: perm,
            availableRights: listAllRights(context, {})
          }
        });
      }
    });

    const anyBanned = _.intersection(bannedRights, mapped);
    if (anyBanned.length) {
      throw new errors.InvalidInput({
        message:
          'The list of rights requested contains one or more ' +
          'rights that cannot be granted to internal API tokens.',
        data: {
          rights: anyBanned
        }
      });
    }
  }

  async function requestInternalToken(context, args) {
    const input = args.input;
    if (!validateTag(input.tag)) {
      throw new errors.InvalidInput({
        message:
          'The supplied tag was not valid. The tag must be ' +
          MAX_TAG_LENGTH +
          ' characters ' +
          'or less, non-empty, and contain only numbers, letters, -, ., and :.',
        data: {
          tag: input.tag,
          length: input.tag.length
        }
      });
    }
    const token = generateToken(input.tag);

    // validate that the rights strings are known.
    // logic must match that in the Scopes directive validator.
    validateRights(input.rights, context);

    // make sure task_type:internal is in rights
    input.rights.push('task_type:internal');

    // normalize to ':' separator
    input.rights.map((right) => mainUtil.stringReplace(right, '.', ':'));
    // clean up list
    const rights = _.uniq(input.rights.sort());

    // get requestor
    // id, org, type
    const requestor = resUtil.getClientInfo(context);

    if (input.label) {
      if (!validateLabel(input.label)) {
        throw new errors.InvalidInput({
          message:
            'The supplied label is not valid. A label can contain any ' +
            'combination of characters but must not be more than ' +
            MAX_LABEL_LENGTH +
            ' characters in length.',
          data: {
            label: input.label,
            length: input.label.length
          }
        });
      }
    }
    // set up token JSON blob
    const date = moment().utc().format();
    const json = {
      tokenId: token, // legacy / required field
      internal: true, // legacy / required field
      isRevoked: true, // legacy / required field
      isPending: true,
      tokenLabel: input.label || input.tag, // legacy field
      requested_rights: rights, // no rights until approved!
      createdDateTime: date,
      modifiedDateTime: date,
      requestorId: requestor.id,
      requestId: uuidv4()
    };

    const sql = `
INSERT INTO
  sso_token (
    token_id,
    json
  ) VALUES (
    $1,
    $2::JSONB
  ) RETURNING token_id AS id, json
    `;

    const res = await dbWrite.map(sql, [token, json], mapNewToken);
    return res[0];
  }

  async function updateInternalToken(context, args) {
    const input = args.input;
    const token = await getInternalToken(context, { id: input.id });

    const json = token.json;

    // set up token JSON blob
    const date = moment().utc().format();
    json.modifiedDateTime = date;

    // if rights were changed, update JSON to
    // reflect the request. It will require approval.
    // current active rights are unchanged.
    if (input.rights) {
      // validate that the rights strings are known.
      // logic must match that in the Scopes directive validator.
      validateRights(input.rights, context);

      // make sure task_type:internal is in rights
      input.rights.push('task_type:internal');
      // clean up list
      const rights = _.uniq(input.rights.sort());

      // get requestor
      // id, org, type
      const requestor = resUtil.getClientInfo(context);

      json.requestorId = requestor.id;
      (json.requestId = uuidv4()), (json.isPending = true);
      json.requested_rights = rights;
    }
    // note that a label-only change does not require approval
    if (input.label) {
      if (!validateLabel(input.label)) {
        throw new errors.InvalidInput({
          message:
            'The supplied label is not valid. A label can contain any ' +
            'combination of characters but must not be more than ' +
            MAX_LABEL_LENGTH +
            ' characters in length.',
          data: {
            label: input.label,
            length: input.label.length
          }
        });
      }
      json.tokenLabel = input.label;
    }

    const sql = `
UPDATE
  sso_token
SET
  "json" = $2::JSONB
WHERE
  token_id = $1
RETURNING token_id AS id, "json"
    `;

    const res = await dbWrite.map(sql, [token.___id, json], mapToken);
    if (!res.length) {
      throw new errors.NotFound({
        message:
          'The token could not be updated, possibly due to a race condition.',
        data: {
          objectId: token.id,
          objectType: 'InternalToken'
        }
      });
    }
    return res[0];
  }

  function getTokenState(token) {
    // 4 possible states based on the isPending and isRevoked flags:
    // isRevoked   | isPending  | state         | note
    // ---------------------------------------------------------------------
    // true        | true       | pending       | new token not yet approved
    // true        | false/none | revoked       | revoked token
    // false       | false/none | active        | normal active token
    // false       | true       | updatePending | active but update requested
    const json = token.json;
    if (json.isRevoked === true) {
      return json.isPending === true ? 'pending' : 'revoked';
    } else if (json.isPending === true) {
      return 'updatePending';
    }
    return 'active';
  }

  async function approveInternalToken(context, args) {
    if (!args.input.id) throw Error('id is required');
    let id = args.input.id;
    let requestId;
    let getArgs = { id };
    if (validator.isUUID(id)) {
      // a request ID is a UUID
      requestId = id;
      getArgs = { requestId };
    }
    // first fetch token to validate that it exists and get state
    const token = await getInternalToken(context, getArgs);
    id = token.___id; // update ID field in case requestId was sent

    const state = getTokenState(token);

    // if it was already revoked, fail out
    if (getTokenState(token) === 'revoked') {
      throw new errors.InvalidInput({
        message: 'The token has already been revoked',
        data: {
          objectType: 'InternalToken',
          objectId: obscureToken(id),
          status: 'revoked',
          requestId: requestId
        }
      });
    }
    // if it was already approved (it's active now), fail out
    if (!(state === 'pending' || state === 'updatePending')) {
      throw new errors.InvalidInput({
        message: 'The token has already been approved',
        data: {
          objectType: 'InternalToken',
          objectId: obscureToken(id),
          status: 'active'
        }
      });
    }
    const json = token.json;

    // if the current user is the same one who requested the token,
    // fail out
    const user = resUtil.getClientInfo(context);
    if (user.id === json.requestorId) {
      throw new errors.NotAllowed({
        message: 'You cannot approve your own token request.',
        data: {
          objectType: 'InternalToken',
          objectId: obscureToken(id),
          status: 'active',
          requestorId: json.requestorId,
          requestId: requestId
        }
      });
    }

    // modify token JSON to reflect active state.
    // swapping rights into active field and updating
    // isRevoked and isPending are the key changes.
    json.rights = json.requestedRights || json.requested_rights;
    delete json.requestedRights;
    delete json.requested_rights;
    json.isRevoked = false;
    delete json.isPending;
    delete json.requestId;
    json.modifiedDateTime = json.approvedDateTime = moment().utc().format();
    json.approverId = user.id;

    const sql = `
UPDATE sso_token
SET "json" = $1::JSON
WHERE token_id = $2
RETURNING token_id AS id, "json"
    `;
    const values = [json, id];
    const res = await dbWrite.map(sql, values, mapToken);

    if (!res.length) {
      throw new errors.NotFound({
        message:
          'The token could not be updated, possibly due to a race condition.',
        data: {
          errorCode: 2003,
          objectId: obscureToken(args.input.id),
          objectType: 'InternalToken'
        }
      });
    }
    return res[0];
  }

  async function revokeInternalToken(context, args) {
    if (!args.input.id) throw Error('id is required');
    // first fetch token to get current state
    const token = await getInternalToken(context, { id: args.input.id });

    // if it was already revoked, fail out
    if (getTokenState(token) === 'revoked') {
      throw new errors.InvalidInput({
        message: 'The token has already been revoked',
        data: {
          objectType: 'InternalToken',
          objectId: obscureToken(args.input.id),
          status: token.status
        }
      });
    }

    // update token JSON blob to reflect revoked status
    const json = token.json;
    json.isRevoked = true; // this is the key change
    delete json.isPending;
    delete json.requestId;
    json.modifiedDateTime = json.revokedDateTime = moment().utc().format();
    // any superadmin can revoke token; no check needed
    const user = resUtil.getClientInfo(context);
    json.revokerId = user.id;

    const sql = `
UPDATE sso_token
SET "json" = $1::JSON
WHERE token_id = $2
RETURNING token_id AS id, "json"
    `;
    const values = [json, args.input.id];

    const res = await dbWrite.map(sql, values, mapToken);

    if (!res.length) {
      throw new errors.NotFound({
        message:
          'The token could not be updated, possibly due to a race condition.',
        data: {
          errorCode: 2003,
          objectId: obscureToken(args.input.id),
          objectType: 'InternalToken'
        }
      });
    }
    return res[0];
  }

  // utility function for rendering available rights
  function getNestedKeys(key, object, allKeys) {
    // "key" is the full key (x.y.z) for this object.
    // if we've reached a leaf node, add the key to our list
    if (!Object.keys(object).length) allKeys.push(key);
    // otherwise, iterate over the children of this object
    // and call recursively down.
    Object.keys(object).forEach((innerKey) => {
      const val = object[innerKey];
      const fullKey = key + (key.length ? '.' : '') + innerKey;
      getNestedKeys(fullKey, val, allKeys);
    });
  }

  // lists all valid rights that can be requested on a token
  function listAllRights(context, args) {
    const res = _.get(
      serviceContext.config,
      'directiveValidation.scopes.additionalRights',
      []
    ).map((str) => str.replace(/\:/g, '.'));

    const keys = Object.keys(fpl.permissions);

    getNestedKeys('', fpl.permissions, res);

    // strip out banned rights, sort, and remove duplicates
    return _.uniq(res.sort().filter((v) => !bannedRights.includes(v)));
  }

  function validateTag(tag) {
    if (!tag) return false;
    if (!tag.length) return false;
    if (tag.length > MAX_TAG_LENGTH) return false;
    if (tag.match(/[^a-zA-z0-9.\-:]+/)) return false;
    return true;
  }

  function validateLabel(label) {
    if (!label) return true; // empty/null ok
    return label.length <= MAX_LABEL_LENGTH;
  }

  return {
    getInternalTokens,
    getInternalToken,

    listAllRights,

    requestInternalToken,
    approveInternalToken,
    revokeInternalToken,
    updateInternalToken,

    validateRights,
    generateToken,
    getTokenTag,
    validateTag,
    obscureToken
  };
};
