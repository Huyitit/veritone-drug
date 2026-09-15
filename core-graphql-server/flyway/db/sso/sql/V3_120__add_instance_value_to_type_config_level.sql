ALTER TYPE type_config_level
    ADD VALUE IF NOT EXISTS 'instance' BEFORE 'organization';
        
ALTER TYPE type_config_level OWNER TO postgres;
