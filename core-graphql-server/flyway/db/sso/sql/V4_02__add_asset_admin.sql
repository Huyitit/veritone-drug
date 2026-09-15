-- VE-12380

-- aiWARE Admin Role
DO $$
BEGIN
    -- Admin (SA permissions and org.create excluded)
    IF EXISTS (SELECT 1 FROM public."role" WHERE role_id = 'ddca9b68-d775-4934-8ffd-7aecc779b652') THEN
    UPDATE public."role" SET permissions = '{8188,0,0,201326592,67108864}'
    WHERE role_id = 'ddca9b68-d775-4934-8ffd-7aecc779b652';
    END IF;
END $$;

-- CMS Customer Service Role
DO $$
BEGIN
    -- Admin (SA permissions and org.create excluded)
    IF EXISTS (SELECT 1 FROM public."role" WHERE role_id = '6d982ee9-ff07-499f-a182-03457a6187f6') THEN
    UPDATE public."role" SET permissions = '{-8184,255,0,1811939328}'
    WHERE role_id = '6d982ee9-ff07-499f-a182-03457a6187f6';
    END IF;
END $$;
