DO $$
BEGIN  
  -- Update the admin roles to include ingest slug permissions for non-OLP inheritance
    -- 155 - AIWARE_SLUG_CREATE
    -- 156 - AIWARE_SLUG_READ
    -- 157 - AIWARE_SLUG_UPDATE
    -- 160 - AIWARE_SLUG_DELETE
    
  -- Note that permissions are added to the predicate so 
  -- that we don't overwrite if permissions have previously changed.

  -- Admin
  UPDATE
    role 
  SET 
    permissions = '{8188,0,0,201326592,1006632960,1}'
  WHERE
    role_id = 'ddca9b68-d775-4934-8ffd-7aecc779b652' AND 
    permissions = '{8188,0,0,201326592,67108864}';
    
  -- CMS Editor
  UPDATE
    role 
  SET  
    permissions = '{-8192,255,0,0,939524096,1}' 
  WHERE
    role_id = 'cf2ed945-176b-4dd9-943e-22fcb1cf684f' AND 
    permissions = '{-8192,255}';
    
  -- Developer Admin
  UPDATE
    role 
  SET 
    permissions = '{0,0,1073741824,8339443,939524096,1}'
  WHERE 
    role_id = '1fa5da82-841b-4efa-b998-45e03fbb3b03' AND
    permissions = '{0,0,1073741824,8339443}';
    
  -- Super Admin
  UPDATE 
    role 
  SET
    permissions = '{8190,0,0,0,1014497280,1}' 
  WHERE
    role_id = '3459c3de-493f-443a-8ad0-ddb9f3f6c76d' AND
    permissions = '{8190,0,0,0,74973184}';
    
  -- aiWARE Administrator
  UPDATE 
    role 
  SET
    permissions = '{-4,-264241153,-1,-536870913,1040187390,1,0,536870912}' 
  WHERE
    role_id = '032218c3-d47e-4287-9d16-7bb867c01266' AND
    permissions = '{-4,-264241153,-1,-536870913,100663294,0,0,536870912}';

  -- aiWARE Instance Administrator
  UPDATE 
    role 
  SET
    permissions = '{-2,-264241153,-1,-1107296257,1073741823,1}' 
  WHERE
    role_id = 'cb18eb9c-3264-434a-8a8d-e6b2d680f66e' AND
    permissions = '{-2,-264241153,-1,-1107296257,134217727}';
END $$;