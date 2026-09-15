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
		'52cb3b17-c6c0-4902-b472-ca76ba06cdff',
		'OrganizationInvitationAccepted',
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
		SELECT 1 FROM event_trigger.event WHERE event_name = 'OrganizationInvitationAccepted' AND event_type = 'organizationInvite' AND application_id = 'system'
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
		'3411d001-7f20-4be8-a1ba-0bbcba05c84b',
		'OrganizationInvitationRejected',
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
		SELECT 1 FROM event_trigger.event WHERE event_name = 'OrganizationInvitationRejected' AND event_type = 'organizationInvite' AND application_id = 'system'
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
		'4f58ba70-c443-48b9-b5eb-eaaa643742a2',
		'OrganizationRequestApproved',
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
		SELECT 1 FROM event_trigger.event WHERE event_name = 'OrganizationRequestApproved' AND event_type = 'organizationInvite' AND application_id = 'system'
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
		'6b356a84-13e4-4768-a9dc-ec04c7778798',
		'OrganizationRequestRejected',
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
		SELECT 1 FROM event_trigger.event WHERE event_name = 'OrganizationRequestRejected' AND event_type = 'organizationInvite' AND application_id = 'system'
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
		'b1dfd736-6436-42ea-a038-00f710f96eb6',
		'OrganizationInvitationRejected',
		'organizationInvite',
		'Resend Invitation',
		null, 
		'https://@@{EXTERNAL_DNS_ZONE}@@/?panel=invite-requests',
		@@{ROOT_ORG_ID}@@,
		'system',
		'system',
		null,
		now(),
		now()
	WHERE NOT EXISTS (
		SELECT 1 FROM event_trigger.notification_actions WHERE event_name = 'OrganizationInvitationRejected' AND event_type = 'organizationInvite' AND action_name = 'Resend Invitation'
	);
END;
$FLYWWAY$
