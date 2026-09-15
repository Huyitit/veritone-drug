-- aiWARE Desktop App Roles
DO $$
BEGIN
    -- Admin (SA permissions and org.create excluded)
    IF EXISTS (SELECT 1 FROM role WHERE role_id = '032218c3-d47e-4287-9d16-7bb867c01266') THEN
    UPDATE role SET permissions = '{-4,-264241153,-1,-1,100663294,0,0,536870912}'
    WHERE role_id = '032218c3-d47e-4287-9d16-7bb867c01266';
    END IF;
END $$;
