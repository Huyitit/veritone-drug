-- Remove old roles
-- Politics - '8a2488ea-ee37-4435-83ff-60ab838c6cb2', 'b05f8083-ad13-4cdd-a931-ae9f4bec4be0' - in citest
-- Broadcaster - b0e3ffed-8ac7-404b-95af-b91a0cc36690
-- Advertiser c9bef318-f638-430d-9fa3-3d1930fe5a5b
-- Admin UI Legacy 'd89b383e-6401-4e8b-8423-afce4afcb3ac'
-- Wizr 'bffb26ad-e89f-4a76-8af6-69dc95cdb23d', '319aee08-9aa4-4389-af1b-2e07f37aaade', '743423c6-5e04-48e9-9daa-951fc2a71fab', '8ae73164-44b8-42b7-8df6-494740594e33'


DELETE FROM sso_user_role WHERE role_id IN ('8a2488ea-ee37-4435-83ff-60ab838c6cb2', 'b05f8083-ad13-4cdd-a931-ae9f4bec4be0',
  'b0e3ffed-8ac7-404b-95af-b91a0cc36690', 'c9bef318-f638-430d-9fa3-3d1930fe5a5b', 'd89b383e-6401-4e8b-8423-afce4afcb3ac',
  'bffb26ad-e89f-4a76-8af6-69dc95cdb23d', '319aee08-9aa4-4389-af1b-2e07f37aaade', '743423c6-5e04-48e9-9daa-951fc2a71fab',
  '8ae73164-44b8-42b7-8df6-494740594e33');

DELETE FROM role WHERE role_id IN ('8a2488ea-ee37-4435-83ff-60ab838c6cb2', 'b05f8083-ad13-4cdd-a931-ae9f4bec4be0',
  'b0e3ffed-8ac7-404b-95af-b91a0cc36690', 'c9bef318-f638-430d-9fa3-3d1930fe5a5b', 'd89b383e-6401-4e8b-8423-afce4afcb3ac',
  'bffb26ad-e89f-4a76-8af6-69dc95cdb23d', '319aee08-9aa4-4389-af1b-2e07f37aaade', '743423c6-5e04-48e9-9daa-951fc2a71fab',
  '8ae73164-44b8-42b7-8df6-494740594e33');