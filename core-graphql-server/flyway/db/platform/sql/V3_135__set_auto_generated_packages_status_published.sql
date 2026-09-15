-- AWT-8968
UPDATE aiware.package p
SET status = 'published'
WHERE auto_generated = true 
AND status != 'published'
