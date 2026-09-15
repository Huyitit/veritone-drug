-- The tokens are to be used for citest. They are added manually to dev, stage, but not in other environments
-- Org less token
INSERT INTO public.sso_token
(token_id, application_id, group_id, "json")
VALUES('18eea9:1ba4ea83fb8644be8116a4bc2c8de0ab740a5208772349bc9fa45594d7c5d101', NULL, NULL, '{"tokenLabel":"hub-agent-internal","rights":["superadmin","admin.org.read","admin.org.create","aiware.admin.instance_admin","admin.roles.update","admin.user.read","token:create","developer.access","developer.engine.read","developer.build.read","job.read","aiware.job.read","aiware.tdo.read","task.read","aiware.task.read","aiware.flow.read","aiware.folder.read","aiware.package.read","aiware.schedule_job.read","aiware.schema.read","aiware.sources.read","recording.read", "aiware.slug.read"],"internal":true,"tokenId":"18eea9:1ba4ea83fb8644be8116a4bc2c8de0ab740a5208772349bc9fa45594d7c5d101"}'::json)
ON CONFLICT (token_id) DO
    UPDATE
    SET
    "json" = excluded.json;

-- Hub token
INSERT INTO public.sso_token
(token_id, application_id, group_id, "json")
VALUES('64df75:e470fa2ed0f043748dde59a1dfcf8e23f033b40d30b949a18d913226a68e46ad', 'ed075985-bc94-406b-8639-44d1da42c3fb'::uuid, 'ea738f5b-9f52-45f3-8db8-3167bfd625fe'::uuid, '{"tokenLabel":"hub-agent:organization:7682:","rights":["superadmin","developer.access","developer.engine.read","developer.engine.update","developer.engine.create","developer.engine.delete","developer.engine.disable","developer.engine.enable","developer.build.approve","developer.build.create","developer.build.delete","developer.build.deploy","developer.build.disapprove","developer.build.invalidate","developer.build.pause","developer.build.read","developer.build.submit","developer.build.unpause","developer.build.update","developer.build.upload","admin.roles.create","admin.roles.delete","admin.roles.update","admin.roles.read","admin.user.create","admin.user.delete","admin.user.read","admin.user.update","user.create","user.delete","user.update","user.read","job.create","job.delete","job.read","job.update","task.create","task.delete","task.read","task.update","recording.create","recording.delete","recording.read","recording.update","source.create","source.delete","source.read","source.update","schema.create","schema.delete","schema.read","schema.search","schema:update","aiware.tdo.create","aiware.tdo.delete","aiware.tdo.read","aiware.tdo.search","aiware.tdo.update","aiware.sdo.create","aiware.sdo.delete","aiware.sdo.read","aiware.sdo.update","aiware.flow.create","aiware.flow.delete","aiware.flow.read","aiware.flow.update","aiware.folder.create","aiware.folder.delete","aiware.folder.file","aiware.folder.read","aiware.folder.update","aiware.scheduled_job.create","aiware.scheduled_job.delete","aiware.schedule_job.read","aiware.scheduled_job.update","aiware.package.create","aiware.package.delete","aiware.package.read","aiware.package.update"],"tokenId":"64df75:e470fa2ed0f043748dde59a1dfcf8e23f033b40d30b949a18d913226a68e46ad","applicationId":"ed075985-bc94-406b-8639-44d1da42c3fb"}'::json)
ON CONFLICT (token_id) DO
    UPDATE
    SET
    "json" = excluded.json;
