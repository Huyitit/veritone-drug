DO $FLYWWAY$
BEGIN
	INSERT INTO event_trigger.event (
		event_id,
		event_name,
		event_type,
		organization_id,
		application_id,
		schema_data,
		schema_hash,
		public,
		created_at_utc,
		updated_at_utc,
		created_by,
		updated_by,
		description
	) SELECT 
		'419ac58e-54b2-4fcb-9c7b-f5a4b5a22484',
		'OrganizationInvitation',
		'organizationInvite',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message OrganizationInvitation {
      string admin_user_id = 10;
      string admin_first_name = 11;
      string admin_last_name = 12;
      int64 organization_id = 13;
      string organization_name = 14;
      string invitee_user_id = 15;
      string invitee_email = 16;
			string organization_invite_id = 17;
    }',
		'cbf767f1975ad33ac5bd9cd8cd8f889cae10a199559c9776c4493e9799e37ccb',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'OrganizationInvitation' AND event_type = 'organizationInvite' AND application_id = 'system'
	);

  INSERT INTO event_trigger.event (
		event_id,
		event_name,
		event_type,
		organization_id,
		application_id,
		schema_data,
		schema_hash,
		public,
		created_at_utc,
		updated_at_utc,
		created_by,
		updated_by,
		description
	) SELECT 
		'35013669-be6f-436b-ba5f-77885f4d9782',
		'OrganizationRequest',
		'organizationInvite',
		@@{ROOT_ORG_ID}@@,
		'system', 
		'message OrganizationRequest {
      string sender_user_id = 10;
      string sender_first_name = 11;
      string sender_last_name = 12;
      int64 organization_id = 13;
      string organization_name = 14;
      string request_email = 15;
			string organization_invite_id = 16;
    }',
		'9d8d5b2efce85ffd01ef1e29dbe4b1b3003f0865f62544bd062bf353fc1687df',
		true,
		now(),
		now(),
		'veritone',
		'veritone',
		'veritone event'
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.event WHERE event_name = 'OrganizationRequest' AND event_type = 'organizationInvite' AND application_id = 'system'
	);

	INSERT INTO event_trigger.notification_actions (
		action_id,
		event_name,
		event_type,
		action_name,
		icon,
		url_template,
		owner_organization_id,
		owner_application_id,
		application_id,
		mailbox_id,
		date_created,
		date_modified
	) SELECT 
		'da104675-6efc-413e-97c4-5d6f6ad6633d',
		'OrganizationInvitation',
		'organizationInvite',
		'Accept Invitation',
		null, 
		'https://@@{EXTERNAL_DNS_ZONE}@@/?panel=invite-requests',
		@@{ROOT_ORG_ID}@@,
		'ed075985-bc94-406b-8639-44d1da42c3fb',
		'system',
		null,
		now(),
		now()
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.notification_actions WHERE event_name = 'OrganizationInvitation' AND event_type = 'organizationInvite' AND action_name = 'Accept Invitation'
	);

	INSERT INTO event_trigger.notification_actions (
		action_id,
		event_name,
		event_type,
		action_name,
		icon,
		url_template,
		owner_organization_id,
		owner_application_id,
		application_id,
		mailbox_id,
		date_created,
		date_modified
	) SELECT 
		'84b9c5df-1540-425f-9b4f-07e45a5e0eac',
		'OrganizationInvitation',
		'organizationInvite',
		'Reject Invitation',
		null, 
		'https://@@{EXTERNAL_DNS_ZONE}@@/?panel=invite-requests',
		@@{ROOT_ORG_ID}@@,
		'system',
		'system',
		null,
		now(),
		now()
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.notification_actions WHERE event_name = 'OrganizationInvitation' AND event_type = 'organizationInvite' AND action_name = 'Reject Invitation'
	);
	
	INSERT INTO event_trigger.notification_actions (
		action_id,
		event_name,
		event_type,
		action_name,
		icon,
		url_template,
		owner_organization_id,
		owner_application_id,
		application_id,
		mailbox_id,
		date_created,
		date_modified
	) SELECT 
		'c40af760-7d91-4f42-93dc-858d1c511507',
		'OrganizationRequest',
		'organizationInvite',
		'View Organization Request',
		null, 
		'https://@@{EXTERNAL_DNS_ZONE}@@/?panel=invite-requests',
		@@{ROOT_ORG_ID}@@,
		'system',
		'system',
		null,
		now(),
		now()
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.notification_actions WHERE event_name = 'OrganizationRequest' AND event_type = 'organizationInvite' AND action_name = 'View Organization Request'
	);
END;
$FLYWWAY$