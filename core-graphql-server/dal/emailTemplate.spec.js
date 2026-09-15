const mockUtil = global.mockUtil;
const { initializeServiceContext } = require('../test/initializeServiceContext');
const serviceContext = initializeServiceContext();

const dal = require('./emailTemplate.js')(serviceContext, serviceContext.config);
const coreRead = serviceContext.dbConnections['core'].read;
const coreWrite = serviceContext.dbConnections['core'].write;

const templateId = '83709857-ed1b-44c6-a5ad-001223fa1e1f';
const orgGuid = '83709857-ed1b-44c6-a5ad-001223fa1e9f';

const mockRow = {
  email_template_id: templateId,
  organization_guid: null,
  code: 'Hello {{firstName}}',
  lang: 'Handlebars',
  default_args: { firstName: 'World' },
  default_from_name: 'Test Sender',
  default_subject: 'Test Subject',
  updated_by: 'user-123',
  created_date: '2024-01-01T00:00:00Z',
  updated_date: '2024-01-01T00:00:00Z'
};

beforeEach(() => {
  Object.keys(serviceContext.dbConnections).forEach((key) => {
    const conn = serviceContext.dbConnections[key];
    if (conn.read) conn.read._clearResultQueue();
    if (conn.write) conn.write._clearResultQueue();
  });
  jest.restoreAllMocks();
});

describe('emailTemplate.js', () => {
  describe('#require', () => {
    it('exports the expected functions', () => {
      expect(typeof dal).toEqual('object');
      expect(dal.emailTemplateCreate).toEqual(expect.any(Function));
      expect(dal.emailTemplateUpdate).toEqual(expect.any(Function));
      expect(dal.emailTemplateDelete).toEqual(expect.any(Function));
      expect(dal.getEmailTemplates).toEqual(expect.any(Function));
      expect(dal.getEmailTemplate).toEqual(expect.any(Function));
      expect(dal._getEmailTemplatesQuery).toEqual(expect.any(Function));
      expect(dal._emailTemplateUpdateQuery).toEqual(expect.any(Function));
    });
  });

  describe('#getEmailTemplate', () => {
    it('returns the matching template', async () => {
      coreRead._push([mockRow], false);
      const result = await dal.getEmailTemplate(mockUtil.makeContext(), { id: templateId });
      expect(result.id).toEqual(templateId);
      expect(result.code).toEqual('Hello {{firstName}}');
    });

    it('throws if id is not provided', async () => {
      await expect(
        dal.getEmailTemplate(mockUtil.makeContext(), {})
      ).rejects.toThrow('Email Template Id is required');
    });

    it('throws if the template does not exist', async () => {
      coreRead._push([], false);
      await expect(
        dal.getEmailTemplate(mockUtil.makeContext(), { id: 'nonexistent' })
      ).rejects.toThrow('Email template not found');
    });
  });

  describe('#getEmailTemplates', () => {
    it('returns a page of templates', async () => {
      coreRead._push([mockRow], false);
      const result = await dal.getEmailTemplates(mockUtil.makeContext(), {});
      expect(result.records).toHaveLength(1);
      expect(result.records[0].id).toEqual(templateId);
    });

    it('returns an empty page when no templates exist', async () => {
      coreRead._push([], false);
      const result = await dal.getEmailTemplates(mockUtil.makeContext(), {});
      expect(result.records).toHaveLength(0);
    });

    it('wraps DB read errors', async () => {
      coreRead._push(new Error('DB timeout'));
      await expect(
        dal.getEmailTemplates(mockUtil.makeContext(), {})
      ).rejects.toThrow('Error getting email template');
    });
  });

  describe('#_getEmailTemplatesQuery', () => {
    const context = mockUtil.makeContext();

    it('filters by ids', async () => {
      const { sql, args } = await dal._getEmailTemplatesQuery(context, {
        ids: [templateId, 'other-id']
      });
      expect(sql).toContain('et.email_template_id = ANY($1)');
      expect(args).toHaveLength(1);
    });

    it('requires organizationGuid IS NULL when not provided', async () => {
      const { sql, args } = await dal._getEmailTemplatesQuery(context, {});
      expect(sql).toContain('organization_guid IS NULL');
      expect(args).toHaveLength(0);
    });

    it('filters by organizationGuid when provided', async () => {
      const { sql, args } = await dal._getEmailTemplatesQuery(context, {
        organizationGuid: orgGuid
      });
      expect(sql).toMatch(/organization_guid = \$/);
      expect(args).toContain(orgGuid);
    });

    it('applies limit and offset', async () => {
      const { sql, args } = await dal._getEmailTemplatesQuery(context, {
        limit: 10,
        offset: 20
      });
      expect(sql).toMatch(/LIMIT/);
      expect(sql).toMatch(/OFFSET/);
      expect(args).toContain(10);
      expect(args).toContain(20);
    });

    it('orders by code ASC', async () => {
      const { sql } = await dal._getEmailTemplatesQuery(context, {
        orderBy: { field: 'code', direction: 'asc' }
      });
      expect(sql).toContain('ORDER BY et.code ASC');
    });

    it('orders by code DESC', async () => {
      const { sql } = await dal._getEmailTemplatesQuery(context, {
        orderBy: { field: 'code', direction: 'desc' }
      });
      expect(sql).toContain('ORDER BY et.code DESC');
    });

    it('orders by email_template_id ASC', async () => {
      const { sql } = await dal._getEmailTemplatesQuery(context, {
        orderBy: { field: 'email_template_id', direction: 'asc' }
      });
      expect(sql).toContain('ORDER BY et.email_template_id ASC');
    });

    it('orders by email_template_id DESC', async () => {
      const { sql } = await dal._getEmailTemplatesQuery(context, {
        orderBy: { field: 'email_template_id', direction: 'desc' }
      });
      expect(sql).toContain('ORDER BY et.email_template_id DESC');
    });

    it('orders by modifiedDateTime ASC', async () => {
      const { sql } = await dal._getEmailTemplatesQuery(context, {
        orderBy: { field: 'modifiedDateTime', direction: 'asc' }
      });
      expect(sql).toContain('ORDER BY et.updated_date ASC');
    });

    it('orders by modifiedDateTime DESC', async () => {
      const { sql } = await dal._getEmailTemplatesQuery(context, {
        orderBy: { field: 'modifiedDateTime', direction: 'desc' }
      });
      expect(sql).toContain('ORDER BY et.updated_date DESC');
    });

    it('orders by createdDateTime ASC', async () => {
      const { sql } = await dal._getEmailTemplatesQuery(context, {
        orderBy: { field: 'createdDateTime', direction: 'asc' }
      });
      expect(sql).toContain('ORDER BY et.created_date ASC');
    });

    it('orders by createdDateTime DESC', async () => {
      const { sql } = await dal._getEmailTemplatesQuery(context, {
        orderBy: { field: 'createdDateTime', direction: 'desc' }
      });
      expect(sql).toContain('ORDER BY et.created_date DESC');
    });

    it('ignores orderBy when field is not in the column mapping', async () => {
      const { sql } = await dal._getEmailTemplatesQuery(context, {
        orderBy: { field: 'unknownField', direction: 'asc' }
      });
      expect(sql).not.toContain('ORDER BY');
    });

    it('ignores orderBy when field is absent', async () => {
      const { sql } = await dal._getEmailTemplatesQuery(context, {
        orderBy: { direction: 'asc' }
      });
      expect(sql).not.toContain('ORDER BY');
    });
  });

  describe('#emailTemplateCreate', () => {
    const context = mockUtil.makeContext();

    it('creates an email template', async () => {
      coreRead._push([], false);
      coreWrite._push([mockRow], false);

      const result = await dal.emailTemplateCreate(
        {
          id: templateId,
          code: 'Hello {{firstName}}',
          lang: 'Handlebars',
          defaultArgs: { firstName: 'World' },
          defaultFromName: 'Test Sender',
          defaultSubject: 'Test Subject'
        },
        context
      );
      expect(result.id).toEqual(templateId);
      expect(result.code).toEqual('Hello {{firstName}}');
    });

    it('throws if id is not provided', async () => {
      await expect(
        dal.emailTemplateCreate({ code: 'Hello' }, context)
      ).rejects.toThrow('Email Template Id is required');
    });

    it('throws if the template already exists', async () => {
      coreRead._push([mockRow], false);
      await expect(
        dal.emailTemplateCreate({ id: templateId, code: 'Hello' }, context)
      ).rejects.toThrow('Email Template already exists');
    });

    it('throws for invalid Handlebars syntax', async () => {
      coreRead._push([], false);
      await expect(
        dal.emailTemplateCreate(
          {
            id: templateId,
            code: '{{#if user}} unclosed block',
            lang: 'Handlebars',
            defaultArgs: { user: true }
          },
          context
        )
      ).rejects.toThrow('Invalid Handlebars template');
    });

    it('throws when a template variable has no matching defaultArg', async () => {
      coreRead._push([], false);
      await expect(
        dal.emailTemplateCreate(
          {
            id: templateId,
            code: 'Hello {{firstName}}',
            lang: 'Handlebars'
            // no defaultArgs
          },
          context
        )
      ).rejects.toThrow('All template variables must have a corresponding defaultArg');
    });

    it('skips Handlebars validation when lang is not Handlebars', async () => {
      coreRead._push([], false);
      coreWrite._push([mockRow], false);

      const result = await dal.emailTemplateCreate(
        {
          id: templateId,
          code: '{{firstName}} would fail if Handlebars-validated',
          lang: 'None'
        },
        context
      );
      expect(result).toBeDefined();
    });

    it('wraps DB write errors', async () => {
      coreRead._push([], false);
      jest.spyOn(coreWrite, 'map').mockRejectedValue(new Error('DB error'));

      await expect(
        dal.emailTemplateCreate(
          {
            id: templateId,
            code: 'Hello {{firstName}}',
            lang: 'Handlebars',
            defaultArgs: { firstName: 'World' }
          },
          context
        )
      ).rejects.toThrow('Error creating email template');
    });
  });

  describe('#emailTemplateUpdate', () => {
    const context = mockUtil.makeContext();

    it('updates an email template', async () => {
      const updatedRow = { ...mockRow, code: 'Hello {{firstName}}, welcome!' };
      coreRead._push([mockRow], false);
      coreWrite._push([updatedRow], false);

      const result = await dal.emailTemplateUpdate(
        {
          id: templateId,
          code: 'Hello {{firstName}}, welcome!',
          lang: 'Handlebars',
          defaultArgs: { firstName: 'World' }
        },
        context
      );
      expect(result.id).toEqual(templateId);
      expect(result.code).toEqual('Hello {{firstName}}, welcome!');
    });

    it('validates the template against the merged defaultArgs', async () => {
      // existing template only has firstName; update adds {{productName}} without extending defaultArgs
      coreRead._push([mockRow], false);

      await expect(
        dal.emailTemplateUpdate(
          {
            id: templateId,
            code: 'Hello {{firstName}}, welcome to {{productName}}',
            lang: 'Handlebars'
            // no defaultArgs — merged result will still only have firstName
          },
          context
        )
      ).rejects.toThrow('All template variables must have a corresponding defaultArg');
    });

    it('passes validation when existing defaultArgs cover all variables in updated code', async () => {
      const rowWithBothArgs = {
        ...mockRow,
        default_args: { firstName: 'World', productName: 'aiWARE' }
      };
      coreRead._push([rowWithBothArgs], false);
      coreWrite._push([rowWithBothArgs], false);

      const result = await dal.emailTemplateUpdate(
        {
          id: templateId,
          code: 'Hello {{firstName}}, welcome to {{productName}}',
          lang: 'Handlebars'
          // no defaultArgs in update — covered by existing template's defaultArgs
        },
        context
      );
      expect(result).toBeDefined();
    });

    it('throws if id is not provided', async () => {
      await expect(
        dal.emailTemplateUpdate({ code: 'Hello' }, context)
      ).rejects.toThrow('Email Template Id is required');
    });

    it('throws if the template does not exist', async () => {
      coreRead._push([], false);
      await expect(
        dal.emailTemplateUpdate({ id: 'nonexistent', code: 'Hello' }, context)
      ).rejects.toThrow('Email template not found');
    });

    it('throws for invalid Handlebars syntax', async () => {
      coreRead._push([mockRow], false);
      await expect(
        dal.emailTemplateUpdate(
          {
            id: templateId,
            code: '{{#if user}} unclosed block',
            lang: 'Handlebars',
            defaultArgs: { user: true }
          },
          context
        )
      ).rejects.toThrow('Invalid Handlebars template');
    });

    it('wraps DB write errors', async () => {
      coreRead._push([mockRow], false);
      jest.spyOn(coreWrite, 'map').mockRejectedValue(new Error('DB error'));

      await expect(
        dal.emailTemplateUpdate(
          {
            id: templateId,
            code: 'Hello {{firstName}}',
            lang: 'Handlebars',
            defaultArgs: { firstName: 'World' }
          },
          context
        )
      ).rejects.toThrow('Error updating email template');
    });
  });

  describe('#_emailTemplateUpdateQuery', () => {
    const context = mockUtil.makeContext();

    it('generates an UPDATE query with all fields', async () => {
      const { sql, values } = await dal._emailTemplateUpdateQuery(
        {
          id: templateId,
          code: 'Hello {{firstName}}',
          lang: 'Handlebars',
          defaultFromName: 'Sender',
          defaultSubject: 'Subject',
          defaultArgs: { firstName: 'World' },
          organizationGuid: orgGuid
        },
        context
      );
      expect(sql).toContain('UPDATE aiware.email_template');
      expect(sql).toContain('email_template_id = $7');
      expect(values).toContain(templateId);
    });

    it('generates the organizationGuid WHERE clause when provided', async () => {
      const { sql } = await dal._emailTemplateUpdateQuery(
        { id: templateId, code: 'Hello', organizationGuid: orgGuid },
        context
      );
      expect(sql).toMatch(/organization_guid = \$/);
    });

    it('uses IS NULL for organizationGuid when not provided', async () => {
      const { sql } = await dal._emailTemplateUpdateQuery(
        { id: templateId, code: 'Hello' },
        context
      );
      expect(sql).toContain('organization_guid IS NULL');
    });

    it('omits null optional fields from the SET clause', async () => {
      const { sql } = await dal._emailTemplateUpdateQuery(
        { id: templateId, code: 'Hello' },
        context
      );
      expect(sql).toContain('email_template_id = $3');
      expect(sql).not.toContain('default_from_name =');
      expect(sql).not.toContain('default_subject =');
    });

    it('generates the correct parameter index when only lang is updated', async () => {
      const { sql } = await dal._emailTemplateUpdateQuery(
        { id: templateId, lang: 'None' },
        context
      );
      expect(sql).toContain('email_template_id = $3');
      expect(sql).toContain('lang =');
      // `code` still appears in the RETURNING column list, so anchor on the
      // assignment operator to assert it is absent from the SET clause only.
      expect(sql).not.toContain('code =');
    });
  });

  describe('#emailTemplateDelete', () => {
    const context = mockUtil.makeContext();

    it('deletes an email template', async () => {
      coreWrite._push([{ email_template_id: templateId }], false);
      const result = await dal.emailTemplateDelete(
        { id: templateId, organizationGuid: orgGuid },
        context
      );
      expect(result).toBeDefined();
    });

    it('throws if id is not provided', async () => {
      await expect(
        dal.emailTemplateDelete({ organizationGuid: orgGuid }, context)
      ).rejects.toThrow('emailTemplateId is required');
    });

    it('throws if organizationGuid is not provided', async () => {
      await expect(
        dal.emailTemplateDelete({ id: templateId }, context)
      ).rejects.toThrow('organizationGuid is required');
    });

    it('throws if the delete returns no rows', async () => {
      coreWrite._push([], false);
      await expect(
        dal.emailTemplateDelete({ id: templateId, organizationGuid: orgGuid }, context)
      ).rejects.toThrow();
    });
  });
});
