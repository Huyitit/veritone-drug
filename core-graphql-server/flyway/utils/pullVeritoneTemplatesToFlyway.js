/**
 * Enable the 'templates/info' permission for your MANDRILL_API_KEY in the Mandrill settings at https://mandrillapp.com/settings.
 */

const fs = require('fs');
const path = require('path');

const MANDRILL_API_KEY = '{{REPLACE_WITH_YOUR_ACTUAL_API_KEY}}';
const PLATFORM_SQL_DIR = path.join(
  __dirname,
  '../db/platform/sql/V3_{{REPLACE_WITH_VERSION}}__insert_mandrill_templates.sql'
);

const templateIds = [
  'forgot-password',
  'admin-reset-password',
  'new-org-user',
  'new-org-user-no-reset',
  'activation',
  'signup-welcome',
  'signup-welcome-developer',
  'org-registration-email-verification-1',

  'dev-mention-notification',
  'watchlist-disabled',
  'dev-expiring-watchlist',

  'new-pending-engine-build',
  'share-collection-one-app',
  'share-mention-star',
  'share-mention-one-app',
  'share-mention-star-with-message',
  'new-organization-invite-requests',
  'new-organization-invitations'
];

async function fetchMandrillTemplateById(templateId) {
  const res = await fetch(
    'https://mandrillapp.com/api/1.0/templates/info.json',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: MANDRILL_API_KEY,
        name: templateId
      })
    }
  );

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} fetching Mandrill template ${templateId}`
    );
  }

  return res.json();
}

function convertTemplateExprToHbs(template) {
  return (
    template
      // ===== Conditionals =====
      .replace(/\*\|IF:([\w.-]+)\|\*/g, '{{#if $1}}') // *|IF:var|*
      .replace(/\*\|ELSE:\|\*/g, '{{else}}') // *|ELSE:|*
      .replace(/\*\|END:IF\|\*/g, '{{/if}}') // *|END:IF|*

      // ===== Loops =====
      .replace(/\*\|FOR:([\w.-]+)\|\*/g, '{{#each $1}}') // *|FOR:items|*
      .replace(/\*\|END:FOR\|\*/g, '{{/each}}') // *|END:FOR|*

      // ===== System Merge Tags =====
      .replace(/\*\|DATE:Y\|\*/g, '{{year}}') // *|DATE:Y|*

      // ===== All Other Merge Vars =====
      .replace(/\*\|([\w.-]+)\|\*/g, '{{$1}}')
  ); // fallback: *|var|*
}

function sanitizeJsonString(str) {
  const cleaned = str.replace(/[\r\n\t]/g, '').trim(); // removes newlines, tabs, trims
  const converted = convertTemplateExprToHbs(cleaned);
  const json = JSON.stringify(converted); // escape for JSON
  return json.replace(/'/g, "''"); // escape single quotes for SQL
}

function generateInsertSQL(template) {
  const { slug, publish_from_name, publish_subject, publish_code } = template;
  return `(
      '${slug}',
      NULL,
      '${sanitizeJsonString(publish_code)}'::jsonb,
      'Handlebars',
      '{}'::jsonb,
      '${convertTemplateExprToHbs(publish_from_name || 'Veritone Team')}',
      '${
        publish_subject
          ? convertTemplateExprToHbs(publish_subject)
          : publish_subject
      }',
      NOW(),
      NOW(),
      '00000000-0000-0000-0000-000000000000'
    )`;
}

(async function main() {
  try {
    const templates = [];
    for (const templateId of templateIds) {
      const template = await fetchMandrillTemplateById(templateId);
      templates.push(template);
    }

    if (!templates.length) {
      console.log('No templates found.');
      return;
    }

    const inserts = templates.map(generateInsertSQL).join(',\n');

    const sql = `
INSERT INTO aiware.email_template (
  email_template_id,
  organization_guid,
  code,
  lang,
  default_args,
  default_from_name,
  default_subject,
  created_date,
  updated_date,
  updated_by
) VALUES 
${inserts};
`;

    fs.writeFileSync(PLATFORM_SQL_DIR, sql.trim());
    console.log(`Flyway SQL script generated: ${PLATFORM_SQL_DIR}`);
  } catch (err) {
    console.error('Error generating script:', err.message);
  }
})();
