-- this creates a row with 00000000-0000-0000-0000-000000000000 user_id to patch system-generated package grants
DO $$
BEGIN    
    IF NOT EXISTS (SELECT 1 FROM sso_user WHERE user_id = '00000000-0000-0000-0000-000000000000') THEN
    INSERT INTO sso_user (
                user_id, 
                user_name, 
                password, 
                kvp,
			    date_created, 
                date_modified, 
                modified_by, 
                last_logged_in,
			    password_reset_token, 
                password_change_required, 
                activation_token,
			    user_settings, 
                status, 
                date_password_last_updated, 
                email, 
                "system_user"
                ) VALUES (
                '00000000-0000-0000-0000-000000000000', 
                'system', 
                '*', 
                '{}', 
                NOW(), 
                NOW(),
                '00000000-0000-0000-0000-000000000000',
                NULL,
                NULL, 
                false, 
                NULL, 
                NULL, 
                'deleted', 
                NOW(), 
                NULL, 
                true
                );
    END IF;
END $$;
