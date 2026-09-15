-- Engine Replacement
CREATE TABLE IF NOT EXISTS job_new.engine_replacement__organization
(
   source_engine_id      TEXT NOT NULL,
   organization_id       INT8 NOT NULL DEFAULT 0,
   replacement_engine_id TEXT NOT NULL,
   -- Using Jsonata (http://docs.jsonata.org/) 
   -- Default "$" at the start of an expression refers to the entire input document
   payload_func   TEXT NOT NULL DEFAULT '$',
   PRIMARY KEY (source_engine_id, organization_id)
);
