import { gql } from 'graphql-request';

// Email template management operations (superadmin scoped)

export const EMAIL_TEMPLATE_CREATE = gql`
  mutation emailTemplateCreate($input: EmailTemplateInput!) {
    emailTemplateCreate(input: $input) {
      id
      code
      lang
      defaultSubject
      defaultFromName
      defaultArgs
      organizationGuid
    }
  }
`;

export const EMAIL_TEMPLATE_UPDATE = gql`
  mutation emailTemplateUpdate($input: EmailTemplateInput!) {
    emailTemplateUpdate(input: $input) {
      id
      code
      lang
      defaultSubject
      defaultFromName
      defaultArgs
      organizationGuid
    }
  }
`;

export const EMAIL_TEMPLATE_GET = gql`
  query emailTemplateGet($id: ID!, $organizationGuid: ID) {
    emailTemplateGet(id: $id, organizationGuid: $organizationGuid) {
      id
      code
      lang
      defaultSubject
      defaultFromName
      defaultArgs
      organizationGuid
    }
  }
`;

/**
 * `emailTemplateDelete` takes a NON-NULL `organizationGuid` and matches the row on
 * it, so it can only ever delete an org-scoped template — a global template (null
 * organization_guid) can never be matched. Note both args are `String!` here, not
 * `ID!`, matching the schema.
 */
export const EMAIL_TEMPLATE_DELETE = gql`
  mutation emailTemplateDelete($id: String!, $organizationGuid: String!) {
    emailTemplateDelete(id: $id, organizationGuid: $organizationGuid) {
      id
      organizationGuid
    }
  }
`;
