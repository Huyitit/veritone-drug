CREATE TYPE public.invite_type AS ENUM ( 'self_signup', 'user_invite' ); 

ALTER TABLE public.organization_invite ADD COLUMN invite_type public.invite_type NOT NULL DEFAULT 'user_invite';
