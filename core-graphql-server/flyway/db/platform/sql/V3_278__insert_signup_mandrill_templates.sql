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
)
SELECT
  'self-service-org-invite-admin-action',
  NULL,
  '"<!DOCTYPE html><html xmlns=\"http://www.w3.org/1999/xhtml\"> <head> <meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\"> <meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\"> <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"> <title></title> <link rel=\"stylesheet\" type=\"text/css\" href=\"https://fonts.googleapis.com/css?family=Nunito&amp;display=swap\"> </head> <body style=\"width:600px; font-family:Nunito,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif !important; padding:40px 35px\"> <div style=\" min-height:60px; padding:40px 20px 20px 0px; \"> <img src=\"https://static.veritone.com/logo/veritone-small-logo-v2.png\" alt=\"Veritone\" style=\"max-height:44px; width:auto\"/></div> <div style=\"padding:10px 30px 30px 30px; border:1px solid #D5DFE9; border-radius:4px;\"> <p style=\"font-size:16px; color:#2A323C\">The email {{invitee_email}} has requested access to the organization {{organization_name}} which requires admin approval. </p> <p style=\"font-size:16px; color:#2A323C\">Please approve or deny this request by clicking one of the following buttons. </p> <a href=\"{{desktop_url_approve}}\" style=\"display:inline-block; margin: 0 auto; padding:2px 20px; background:#53ac54; color:#fff; border-radius:10px; font-weight:bold; text-decoration:none;\">Approve</a> or <a href=\"{{desktop_url_deny}}\" style=\" display:inline-block; margin: 0 auto; padding:2px 20px; background:#ac5653; color:#fff; border-radius:10px; font-weight:bold; text-decoration:none;\">Deny</a> </div> <div style=\"text-align:center; margin-top:30px;\"><span style=\"margin-right:5px; color:#5C6269\">© Veritone, Inc</span><span style=\"color:#5C6269\">5291 California Ave | Ste. 350 | Irvine, CA 92617</span></div> <div style=\"margin-top:8px; text-align:center;\"><span style=\"margin-right:14px;\"><a style=\"color:#6098D1\" href=\"{{url_privacy_policy}}\">Privacy Policy</a></span><span style=\"color:#6098D1; margin-right:14px;\"></span><span><a style=\"color:#6098D1\" href=\"{{url_term_service}}\">Term of Service</a></span></div> </body></html>"'::jsonb,
  'Handlebars',
  '{}'::jsonb,
  'Veritone Team',
  'Review new user registration',
  NOW(),
  NOW(),
  '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
  SELECT 1 FROM aiware.email_template t
  WHERE t.email_template_id = 'self-service-org-invite-admin-action' AND t.organization_guid IS NULL
);

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
)
SELECT
  'self-service-org-invite-under-review',
  NULL,
  '"<!DOCTYPE html> <html xmlns=\"http://www.w3.org/1999/xhtml\"> <head> <meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\"> <meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\"> <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"> <title></title> <link rel=\"stylesheet\" type=\"text/css\" href=\"https://fonts.googleapis.com/css?family=Nunito&amp;display=swap\"> </head> <body style=\"width:600px; font-family:Nunito,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif !important; padding:40px 35px\"> <div style=\" min-height:60px; padding:40px 20px 20px 0px; \"> <img src=\"https://static.veritone.com/logo/veritone-small-logo-v2.png\" alt=\"Veritone\" style=\"max-height:44px; width:auto\"/></div> <div style=\"padding:10px 30px 30px 30px; border:1px solid #D5DFE9; border-radius:4px;\"> <div style=\"margin-top:20px\"> <p style=\"font-size:16px; color:#2A323C\">Thanks for requesting access to {{organization_name}}</p> </div> <p style=\"font-size:16px; color:#2A323C\">Your request for {{invitee_email}} is under review. You will receive another email once your request is reviewed. </p> </div> <div style=\"text-align:center; margin-top:30px;\"><span style=\"margin-right:5px; color:#5C6269\">© Veritone, Inc</span><span style=\"color:#5C6269\">5291 California Ave | Ste. 350 | Irvine, CA 92617</span></div> <div style=\"margin-top:8px; text-align:center;\"><span style=\"margin-right:14px;\"><a style=\"color:#6098D1\" href=\"{{url_privacy_policy}}\">Privacy Policy</a></span><span style=\"color:#6098D1; margin-right:14px;\"></span><span><a style=\"color:#6098D1\" href=\"{{url_term_service}}\">Term of Service</a></span></div> </body> </html>"'::jsonb,
  'Handlebars',
  '{}'::jsonb,
  'Veritone Team',
  'Your join request is under review',
  NOW(),
  NOW(),
  '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
  SELECT 1 FROM aiware.email_template t
  WHERE t.email_template_id = 'self-service-org-invite-under-review' AND t.organization_guid IS NULL
);

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
)
SELECT
  'self-service-org-invite-email-verification',
  NULL,
  '"<!DOCTYPE html> <html xmlns=\"http://www.w3.org/1999/xhtml\"> <head> <meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\"> <meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\"> <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"> <title></title> <link rel=\"stylesheet\" type=\"text/css\" href=\"https://fonts.googleapis.com/css?family=Nunito&amp;display=swap\"> </head> <body style=\"width:600px; font-family:Nunito,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif !important; padding:40px 35px\"> <div style=\" min-height:60px; padding:40px 20px 20px 0px; \"> <img src=\"https://static.veritone.com/logo/veritone-small-logo-v2.png\" alt=\"Veritone\" style=\"max-height:44px; width:auto\"/></div> <div style=\"padding:10px 30px 30px 30px; border:1px solid #D5DFE9; border-radius:4px;\"> <p style=\"font-size:16px; color:#2A323C\">Please verify this email to complete your registration for the organization {{organization_name}}. </p> <a href=\"{{verify_url}}\" style=\"display:inline-block; margin: 0 auto; padding:2px 20px; background:#4287f5; color:#fff; border-radius:10px; font-weight:bold; text-decoration:none;\">Verify</a> </div> <div style=\"text-align:center; margin-top:30px;\"><span style=\"margin-right:5px; color:#5C6269\">© Veritone, Inc</span><span style=\"color:#5C6269\">5291 California Ave | Ste. 350 | Irvine, CA 92617</span></div> <div style=\"margin-top:8px; text-align:center;\"><span style=\"margin-right:14px;\"><a style=\"color:#6098D1\" href=\"{{url_privacy_policy}}\">Privacy Policy</a></span><span style=\"color:#6098D1; margin-right:14px;\"></span><span><a style=\"color:#6098D1\" href=\"{{url_term_service}}\">Term of Service</a></span></div> </body> </html>"'::jsonb,
  'Handlebars',
  '{}'::jsonb,
  'Veritone Team',
  'Verify your email',
  NOW(),
  NOW(),
  '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
  SELECT 1 FROM aiware.email_template t
  WHERE t.email_template_id = 'self-service-org-invite-email-verification' AND t.organization_guid IS NULL
);
