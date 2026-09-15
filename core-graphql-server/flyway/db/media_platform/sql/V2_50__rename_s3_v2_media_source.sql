-- Rename source 24 from 'Amazon S3 - v2' to 'Discovery: Amazon S3'
-- 
-- There may eventually be multiple source types for "Discovery" 
-- (as in "Discovery: Azure" or "Discovery: FTP", etc) so we want to 
-- differentiate this one from "Amazon S3" using something other than 
-- "v2" and also establish a pattern for future Discovery source types.

UPDATE public.media_source_type
  SET media_source_type_name = 'Discovery: Amazon S3'
  WHERE 
    media_source_type_id = 24 
    AND media_source_type_name = 'Amazon S3 - v2'
;
