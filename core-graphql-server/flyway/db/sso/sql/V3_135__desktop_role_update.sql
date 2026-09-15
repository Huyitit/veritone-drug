-- aiWARE Desktop App Roles
DO $$
BEGIN
    -- Admin (SA permissions and org.create excluded)
    IF EXISTS (SELECT 1 FROM role WHERE role_id = '7b0aa003-c762-4bf2-8f1f-08a4a98b4cb4') THEN
    UPDATE role SET permissions = '{-2004312064,140}'
    WHERE role_id = '7b0aa003-c762-4bf2-8f1f-08a4a98b4cb4';
    END IF;
END $$;
