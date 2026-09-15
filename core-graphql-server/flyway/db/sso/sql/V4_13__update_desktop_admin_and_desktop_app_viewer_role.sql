DO $$
BEGIN  
    UPDATE public."role" 
    SET permissions = '{-4,-264241153,-1,-536870913,100663294,0,0,536870912}'
    WHERE role_id = '032218c3-d47e-4287-9d16-7bb867c01266'::uuid
      AND permissions != '{-4,-264241153,-1,-536870913,100663294,0,0,536870912}';
END $$;
