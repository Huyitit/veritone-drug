INSERT INTO public.rbac_auth_group
(auth_group_id, auth_group_name, auth_group_description, organization_guid, kvp, date_created, date_modified, modified_by)
VALUES('041296e3-0c4b-40cf-a5db-7702ac535a0c'::uuid, 'default', 'customer success org default user group', 'ed075985-bc94-406b-8639-44d1da42c3fb'::uuid, NULL, '2022-04-21 21:26:43.541', '2022-04-21 21:26:43.541', 'b1f59aa2-8af4-48c8-b156-897e8dda1100'::uuid);

INSERT INTO public.rbac_auth_group_member
(auth_group_id, member_id, is_group)
VALUES('041296e3-0c4b-40cf-a5db-7702ac535a0c'::uuid, 'b1f59aa2-8af4-48c8-b156-897e8dda1100'::uuid, NULL);
