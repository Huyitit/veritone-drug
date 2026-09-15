-- https://steel-ventures.atlassian.net/browse/AWT-1190 --

UPDATE job_new.engine 
SET engine_alias_logo_path = 'https://s3.us-east-1.amazonaws.com/static.veritone.com/assets/engines_null.svg'
WHERE engine_alias_logo_path is null 
