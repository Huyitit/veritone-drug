const pgp = require('pg-promise')({ promiseLib: Promise });
const moment = require('moment');

const roleSql = `
select
  u.user_id as user_id,
  r.role_id as role_id
from sso_user as u
left outer join sso_user_role as r
  on r.user_id = u.user_id
  where role_id is null
limit 2000
  `;

const devConStr =
  'postgres://postgres:postgres@0.pg-media.aws-dev.veritone.com:5432/sso?sslmode=disable';
const stageConStr =
  'postgres://postgres:postgres@0.pg-media.aws-stage.veritone.com:5432/sso?sslmode=disable';
const devDb = pgp(devConStr);
const stageDb = pgp(stageConStr);
const now = moment()
  .utc()
  .toISOString();

let fixCount = 0;

async function go() {
  const devRows = await devDb.query(roleSql);

  console.log('Got ' + devRows.length + ' possible corrupted users from dev');

  for (let i = 0; i < devRows.length; i++) {
    const userId = devRows[i].user_id;
    const roleSql = `
select r.role_id from sso_user_role as r where user_id = $1
    `;
    const roleRows = await stageDb.query(roleSql, userId);
    if (roleRows.length > 0) {
      await addRoles(userId, roleRows);
    }
  }
}

async function addRoles(userId, roleRows) {
  fixCount++;
  const sqlParts = [];
  const values = [userId, now, 'f94d1303-6abd-49a5-9d98-fb93fb22d063'];
  roleRows.forEach(row => {
    values.push(row.role_id);
    sqlParts.push(
      `insert into sso_user_role (user_id, date_created, created_by, role_id) values ($1, $2, $3, \$${
        values.length
      })`
    );
  });
  const sql = sqlParts.join(';\n');
  //  console.log(' DEV SQL '+sql+' '+values);
  await devDb.query(sql, values);
  console.log('  added ' + roleRows.length + ' roles for user ' + userId);
}

go().then(() => {
  console.log('Done - fixed ' + fixCount + ' users');
  process.exit(0);
});
