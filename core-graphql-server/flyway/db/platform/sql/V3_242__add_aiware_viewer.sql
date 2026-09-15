-- Insert aiware viewer only if it doesn't exist

INSERT INTO job_new.viewer (viewer_id,owner_organization_id,name,description,icon,mimetype,viewer_type,date_created,date_modified,created_by,modified_by,is_public) VALUES
	 ('83b45f65-d400-403f-a2b6-be455ededc00'::uuid,@@{ROOT_ORG_ID}@@,'Viewers Data Detail - Custom Data','Custom Viewer to pass custom metadata and other properties','','','external','2025-01-22 21:24:22.012275','2025-01-22 21:24:22.012275','ee745ca5-4151-4db6-a5e6-50d0e8af85f5'::uuid,'ee745ca5-4151-4db6-a5e6-50d0e8af85f5'::uuid,true)
ON CONFLICT (viewer_id) DO NOTHING;

INSERT INTO job_new.viewer_build (viewer_build_id,viewer_id,source_url,access_url,"version",status) VALUES
	 ('8999d5cb-3c6c-4e53-bd09-ff7dc20ae53a'::uuid,'83b45f65-d400-403f-a2b6-be455ededc00'::uuid,'https://viewers.@@EXTERNAL_DNS_ZONE@@/asset','https://viewers.@@EXTERNAL_DNS_ZONE@@/asset',1,'deployed')
ON CONFLICT (viewer_build_id) DO NOTHING;

-- Mark any existing viewer_build records with the same viewer_id but different viewer_build_id as deleted
UPDATE job_new.viewer_build 
SET status = 'deleted' 
WHERE viewer_id = '83b45f65-d400-403f-a2b6-be455ededc00'::uuid 
  AND viewer_build_id != '8999d5cb-3c6c-4e53-bd09-ff7dc20ae53a'::uuid;