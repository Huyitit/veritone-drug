

UPDATE job_new.engine 
  SET owner_organization_id = @@{ROOT_ORG_ID}@@
WHERE owner_organization_id = 1;
