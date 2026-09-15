-- Update CRUD package permissions to Admin role
UPDATE public."role" 
SET permissions = '{8188,0,0,0,74973184}'
WHERE role_id = 'ddca9b68-d775-4934-8ffd-7aecc779b652'::uuid
  AND permissions = '{8188,0,0,0,67108864}';

-- Update CRUD package permissions to SuperAdmin role
UPDATE public."role" 
SET permissions = '{8190,0,0,0,74973184}'
WHERE role_id = '3459c3de-493f-443a-8ad0-ddb9f3f6c76d'::uuid
  AND permissions = '{8190,0,0,0,67108864}';