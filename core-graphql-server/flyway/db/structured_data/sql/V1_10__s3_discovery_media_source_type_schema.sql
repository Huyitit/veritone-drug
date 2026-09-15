-- VE-18814 Add DataRegistry and Schema(s) for S3 Discovery Source Type

-- At the time of writing, the schema in stage had a different ID than the one in prod (uk-1
-- may also differ). To ensure all systems share the same canonical schema, we deprecate and
-- deactivate any existing schema with the wrong ID and insert one with the correct ID.
-- 
-- This will leave any existing sources that reference the old schema in a valid state, still
-- compatible with the discovery process, but they will be using a deprecated schema and will be
-- ineligible for any new features that are added to the schema in the future. They can be
-- updated to use the new schema by updating their correlation_schema_id to the new schema's ID
-- (manually)

-- Update old data_registry_metadata records with the right name but the wrong ID to be "deprecated"
UPDATE public.data_registry_metadata
SET "name" = '[Deprecated] Discovery: Amazon S3 Source Type Schema'
WHERE "name" = 'Discovery: Amazon S3 Source Type Schema'
  AND id != '095b2662-be3a-4379-916f-d4258ca50abf'::uuid;

-- Deactivate data_registries that reference the deprecated metadata
UPDATE public.data_registries
SET "status" = 'inactive'::public.enum_data_registries_status
WHERE data_registry_metadata_id IN (
  SELECT id FROM public.data_registry_metadata
  WHERE "name" = '[Deprecated] Discovery: Amazon S3 Source Type Schema'
)
AND "status" <> 'inactive'::public.enum_data_registries_status;

-- Insert the canonical data_registry_metadata (aka "Data Registry") record if it does not
-- already exist.
INSERT INTO public.data_registry_metadata (
  id,
  "name",
  description,
  "source",
  org_id,
  created_by,
  modified_by,
  created_at,
  updated_at,
  is_system,
  is_public
) VALUES (
  '095b2662-be3a-4379-916f-d4258ca50abf'::uuid,
  'Discovery: Amazon S3 Source Type Schema',
  'Configuration schema for source Discovery: Amazon S3 (source type 24)',
  'Discovery: Amazon S3 Source Type Schema',
  @@{ROOT_ORG_ID}@@,
  '6f391720-ccb9-4f03-8e31-938118326dc4',
  '6f391720-ccb9-4f03-8e31-938118326dc4',
  '2024-06-24 20:45:08.274',
  '2024-06-24 20:45:08.274',
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET 
  "name"        = EXCLUDED."name",
  description   = EXCLUDED.description,
  "source"      = EXCLUDED."source",
  org_id        = EXCLUDED.org_id,
  is_system     = EXCLUDED.is_system,
  is_public     = EXCLUDED.is_public;

-- Ensure we have a consistent set of schemas by removing any unknown data_registries with the
-- same metadata_id as the canonical schema but that do not have the canonical IDs. I do not
-- believe there should be any of these, but this is a safety measure so if there are any
-- instances that have been manually edited, they are brought back into a consistent state. 
UPDATE public.data_registries
SET "status" = 'inactive'::public.enum_data_registries_status
WHERE data_registry_metadata_id = '095b2662-be3a-4379-916f-d4258ca50abf'::uuid
  AND id not in (
    'd616220e-101e-48cd-aa81-5cca955b6f41'::uuid,
    '15809312-bf11-45c3-b271-aa07378e6bf9'::uuid
  );

-- Insert the canonical data_registries (aka "Schema") records.
INSERT INTO public.data_registries (
  id, 
  "schema", 
  org_id, 
  created_by, 
  modified_by, 
  "createdAt", 
  "updatedAt", 
  data_registry_metadata_id, 
  major_version, 
  minor_version, 
  "status", 
  storage_name
) VALUES (
  'd616220e-101e-48cd-aa81-5cca955b6f41'::uuid, 
  '{"type": "object", "anyOf": [{"required": ["roleArn"]}, {"required": ["awsKey", "awsSecret"]}], "$schema": "http://json-schema.org/draft-07/schema#", "required": ["region", "bucketName"], "properties": {"awsKey": {"$id": "/properties/awsKey", "type": "string", "title": "AWS Key", "description": "Client key used to access bucket contents"}, "region": {"$id": "/properties/region", "type": "string", "title": "Bucket Region", "description": "AWS region that is hosting the bucket"}, "roleArn": {"$id": "/properties/roleArn", "type": "string", "title": "AWS Role ARN", "description": "Role used to access bucket contents"}, "awsSecret": {"$id": "/properties/awsSecret", "type": "string", "title": "AWS Secret Key", "description": "Secret key used to access bucket contents. Required if awsKey is provided"}, "directory": {"$id": "/properties/directory", "type": "string", "title": "Directory", "description": "Limit discovery of files to those with this prefix. Blank for entire bucket"}, "bucketName": {"$id": "/properties/bucketName", "type": "string", "title": "Bucket Name", "description": "Name of the bucket to discover files in"}, "excludeFiles": {"$id": "/properties/excludeFiles", "type": "string", "title": "Exclude Files", "description": "Files that match this regular expression are ineligible for discovery"}, "discoveryPolicy": {"$id": "/properties/discoveryPolicy", "type": "object", "title": "Discovery Policy", "required": ["version", "policies"], "properties": {"version": {"type": "integer", "title": "Version", "minimum": 1, "description": "Version of discovery policy"}, "policies": {"type": "array", "items": {"type": "object", "properties": {"data": {"type": "object", "title": "TDO Data", "description": "Additional data to include in the TDO''s details.ingestData field", "additionalProperties": {"type": "string"}}, "batch": {"type": "object", "title": "Batch File", "required": ["name"], "properties": {"name": {"type": "array", "items": {"type": "string"}, "title": "Batch File Name", "minItems": 1, "description": "Possible names of batch files, may contain variables"}, "partitionField": {"type": "string", "title": "Partition Field", "description": "Name of the data element that identifies a different bundle. A new TDO will be created for each instance of this field"}}, "description": "Describes the file that contains data for a batch of files. Do not define if this isn''t a batch operation"}, "files": {"type": "array", "items": {"type": "object", "title": "Bundle File", "required": ["name", "assetType"], "properties": {"data": {"type": "object", "title": "TDO Asset Data", "description": "Additional data to include in the Asset''s details.ingestData field", "additionalProperties": {"type": "string"}}, "name": {"type": "array", "items": {"type": "string"}, "title": "File Name", "minItems": 1, "description": "Possible names of file, may contain variables"}, "keyName": {"type": "array", "items": {"type": "string"}, "title": "File Name for Bundle Key", "description": "Optional names of file, may contain variables. Required if the name contains a $[] variable"}, "assetType": {"type": "string", "title": "TDO Asset Type", "description": "Asset type to use when adding this file to a TDO: media, thumbnail, preview, ancillary, data, etc"}}, "description": "Describes one possible files in a bundle"}, "title": "Bundle Files", "minItems": 1, "description": "Describes all possible files in a bundle"}, "bundleKey": {"type": "string", "title": "Bundle Key", "description": "Unique key for this bundle of files. All files with the same key will be added to one TDO"}, "description": {"type": "string", "title": "Description", "description": "Description of this specific policy. Does not impact discovery"}}}, "title": "Policies", "minItems": 1, "description": "Policies to apply to a file. Processing stops when the first one succeeds"}, "description": {"type": "string", "title": "Description", "description": "Overall description of the discovery policy. Does not impact discovery"}}, "description": "Rules used to find and group files that belong together. See https://docs.veritone.com for details"}}}'::jsonb, 
  @@{ROOT_ORG_ID}@@,
  '6f391720-ccb9-4f03-8e31-938118326dc4',
  '6f391720-ccb9-4f03-8e31-938118326dc4', 
  '2024-06-24 20:45:08.298', 
  '2024-06-24 20:45:08.298',
  '095b2662-be3a-4379-916f-d4258ca50abf'::uuid, 
  1, 
  0, 
  'inactive'::public.enum_data_registries_status, 
  'sdo_discovery_1_o_5_x_1_wnhvbr'
),(
  '15809312-bf11-45c3-b271-aa07378e6bf9'::uuid, 
  '{"type": "object", "anyOf": [{"required": ["roleArn"]}, {"required": ["awsKey", "awsSecret"]}], "$schema": "http://json-schema.org/draft-07/schema#", "required": ["region", "bucketName"], "properties": {"awsKey": {"$id": "/properties/awsKey", "type": "string", "title": "AWS Key", "description": "Client key used to access bucket contents"}, "region": {"$id": "/properties/region", "type": "string", "title": "Bucket Region", "description": "AWS region that is hosting the bucket"}, "sqsUrl": {"$id": "/properties/sqsUrl", "type": "string", "title": "SQS Queue URL", "$comment": "since v1.1", "description": "SQS queue URL to monitor to discover new files and updates as they occur (optional)"}, "roleArn": {"$id": "/properties/roleArn", "type": "string", "title": "AWS Role ARN", "description": "Role used to access bucket contents"}, "awsSecret": {"$id": "/properties/awsSecret", "type": "string", "title": "AWS Secret Key", "description": "Secret key used to access bucket contents. Required if awsKey is provided"}, "directory": {"$id": "/properties/directory", "type": "string", "title": "Directory", "description": "Limit discovery of files to those with this prefix. Blank for entire bucket"}, "bucketName": {"$id": "/properties/bucketName", "type": "string", "title": "Bucket Name", "description": "Name of the bucket to discover files in"}, "excludeFiles": {"$id": "/properties/excludeFiles", "type": "string", "title": "Exclude Files", "description": "Files that match this regular expression are ineligible for discovery"}, "scanSchedule": {"$id": "/properties/scanSchedule", "type": "string", "title": "Rescan Schedule (Duration or CronTab)", "$comment": "since v1.1", "description": "Time between scans (min 1h), or crontab string compatible with gocron"}, "discoveryPolicy": {"$id": "/properties/discoveryPolicy", "type": "object", "title": "Discovery Policy", "required": ["version", "policies"], "properties": {"version": {"type": "integer", "title": "Version", "minimum": 1, "$comment": "since 1.1 - minimum S3DAv2 version is 2", "description": "Version of discovery policy"}, "policies": {"type": "array", "items": {"type": "object", "properties": {"data": {"type": "object", "title": "TDO Data", "description": "Additional data to include in the TDOs details.ingestData field", "additionalProperties": {"type": "string"}}, "batch": {"type": "object", "title": "Batch File", "required": ["name"], "properties": {"name": {"type": "array", "items": {"type": "string"}, "title": "Batch File Name", "minItems": 1, "description": "Possible names of batch files, may contain variables"}, "partitionField": {"type": "string", "title": "Partition Field", "description": "Name of the data element that identifies a different bundle. A new TDO will be created for each instance of this field"}}, "description": "Describes the file that contains data for a batch of files. Do not define if this isnt a batch operation"}, "files": {"type": "array", "items": {"type": "object", "title": "Bundle File", "required": ["name", "assetType"], "properties": {"data": {"type": "object", "title": "TDO Asset Data", "description": "Additional data to include in the Assets details.ingestData field", "additionalProperties": {"type": "string"}}, "name": {"type": "array", "items": {"type": "string"}, "title": "File Name", "minItems": 1, "description": "Possible names of file, may contain variables"}, "keyName": {"type": "array", "items": {"type": "string"}, "title": "File Name for Bundle Key", "description": "Optional names of file, may contain variables. Required if the name contains a $[] variable"}, "assetType": {"type": "string", "title": "TDO Asset Type", "description": "Asset type to use when adding this file to a TDO: media, thumbnail, preview, ancillary, data, etc"}}, "description": "Describes one possible files in a bundle"}, "title": "Bundle Files", "minItems": 1, "description": "Describes all possible files in a bundle"}, "folders": {"type": "array", "items": {"type": "object", "title": "TDO Folder Policy", "required": ["rootFolderType", "folderPath"], "properties": {"filter": {"type": "object", "title": "Folder Filter", "properties": {"before": {"type": "string", "title": "File Modified Before", "format": "date-time", "description": "Only files last modified before this UTC RFC-3339 date are eligible for this folder"}, "prefix": {"type": "array", "items": {"type": "string"}, "title": "File URI Prefix", "description": "Only files with keys that match one of these prefixes are eligible for this folder"}, "extension": {"type": "array", "items": {"type": "string"}, "title": "File Extensions", "description": "Only files with one of these extensions are eligible for this folder"}, "onOrAfter": {"type": "string", "title": "File Modified On or After", "format": "date-time", "description": "Only files last modified on or after this UTC RFC-3339 date are eligible for this folder"}, "contentType": {"type": "array", "items": {"type": "string"}, "title": "File Content Types", "description": "Only files with one of these content types are eligible for this folder"}, "regularExpression": {"type": "string", "title": "File Name Regular Expression", "description": "Only files with names that fully match this regular expression are eligible for this folder"}}, "description": "Filter to apply to file URI or metadata to determine if this folder applies. Undefined or zero-value fields are ignored"}, "folderId": {"type": "string", "title": "Folder ID", "description": "ID of existing folder to create TDOs in. If provided, rootFolderType and folderPath are ignored"}, "folderPath": {"type": "string", "title": "Folder Path", "description": "Path of folder in the root type to create TDOs in"}, "rootFolderType": {"type": "string", "title": "Root Folder Type", "description": "Type of root folder to create TDOs in"}}, "description": "Describes the folder to create TDOs in"}, "title": "TDO Folder Policies", "$comment": "since v1.1", "minItems": 1, "description": "Describes the folders to create TDOs in. First matching folder is used. If no matching folders, a new folder is created for each source."}, "bundleKey": {"type": "string", "title": "Bundle Key", "description": "Unique key for this bundle of files. All files with the same key will be added to one TDO"}, "dataFiles": {"type": "array", "items": {"type": "string"}, "title": "Data File URIs", "$comment": "since v1.1", "minItems": 1, "description": "List of files to read additional data from to include in the TDOs details.ingestData field. Later values overwrite earlier values, and all values overwrite the TDO Data values."}, "description": {"type": "string", "title": "Description", "description": "Description of this specific policy. Does not impact discovery"}}}, "title": "Policies", "minItems": 1, "description": "Policies to apply to a file. Processing stops when the first one succeeds"}, "description": {"type": "string", "title": "Description", "description": "Overall description of the discovery policy. Does not impact discovery"}}, "description": "Rules used to find and group files that belong together. See https://docs.veritone.com for details"}}}'::jsonb,
  @@{ROOT_ORG_ID}@@,
  '6f391720-ccb9-4f03-8e31-938118326dc4', 
  '6f391720-ccb9-4f03-8e31-938118326dc4', 
  '2026-02-09 15:38:06.581', 
  '2026-02-09 15:38:06.581',
  '095b2662-be3a-4379-916f-d4258ca50abf'::uuid, 
  1, 
  1, 
  'published'::public.enum_data_registries_status, 
  'sdo_discovery_1_o_5_x_1_wnhvbr'
)
ON CONFLICT (id) DO UPDATE SET 
  "schema"                  = EXCLUDED."schema",
  org_id                    = EXCLUDED.org_id,
  "updatedAt"               = EXCLUDED."updatedAt",
  data_registry_metadata_id = EXCLUDED.data_registry_metadata_id,
  major_version             = EXCLUDED.major_version,
  minor_version             = EXCLUDED.minor_version,
  "status"                  = EXCLUDED."status",
  storage_name              = EXCLUDED.storage_name;
  
-- create the SDO storage table for this data registry if it does not already exist.
DO $FLYWAY$
BEGIN
    IF (NOT EXISTS (SELECT * 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = 'public' 
                    AND  TABLE_NAME = 'sdo_discovery_1_o_5_x_1_wnhvbr')) THEN
        CREATE TABLE public.sdo_discovery_1_o_5_x_1_wnhvbr
        (
            id uuid NOT NULL,
            data_registry_id uuid NOT NULL,
            data jsonb,
            created_by character varying(3000) COLLATE pg_catalog."default",
            modified_by character varying(3000) COLLATE pg_catalog."default",
            organization_id integer NOT NULL DEFAULT @@{ROOT_ORG_ID}@@,
            application_id uuid,
            dataset_id uuid,
            "createdAt" timestamp with time zone NOT NULL,
            "updatedAt" timestamp with time zone NOT NULL,
            CONSTRAINT sdo_discovery_1_o_5_x_1_wnhvbr_pkey PRIMARY KEY (id),
            CONSTRAINT sdo_discovery_1_o_5_x_1_wnhvbr_data_registry_id_fkey FOREIGN KEY (data_registry_id)
                REFERENCES public.data_registries (id) MATCH SIMPLE
                ON UPDATE CASCADE
                ON DELETE NO ACTION
        )
        WITH (
            OIDS = FALSE
        )
        TABLESPACE pg_default;

        ALTER TABLE public.sdo_discovery_1_o_5_x_1_wnhvbr OWNER to postgres;
        GRANT ALL ON TABLE public.sdo_discovery_1_o_5_x_1_wnhvbr TO postgres;

        -- Index: sdo_discovery_1_o_5_x_1_wnhvbr_created_at
        CREATE INDEX sdo_discovery_1_o_5_x_1_wnhvbr_created_at
            ON public.sdo_discovery_1_o_5_x_1_wnhvbr USING btree
            ("createdAt" DESC NULLS FIRST)
            TABLESPACE pg_default;


        -- Index: sdo_discovery_1_o_5_x_1_wnhvbr_data_registry_id
        CREATE INDEX sdo_discovery_1_o_5_x_1_wnhvbr_data_registry_id
            ON public.sdo_discovery_1_o_5_x_1_wnhvbr USING btree
            (data_registry_id ASC NULLS LAST)
            TABLESPACE pg_default;


        -- Index: sdo_discovery_1_o_5_x_1_wnhvbr_organization_id
        CREATE INDEX sdo_discovery_1_o_5_x_1_wnhvbr_organization_id
            ON public.sdo_discovery_1_o_5_x_1_wnhvbr USING btree
            (organization_id ASC NULLS LAST)
            TABLESPACE pg_default;


        -- Trigger: sdo_discovery_1_o_5_x_1_wnhvbr_trigger
        CREATE TRIGGER sdo_discovery_1_o_5_x_1_wnhvbr_trigger
            BEFORE INSERT
            ON public.sdo_discovery_1_o_5_x_1_wnhvbr
            FOR EACH ROW
            EXECUTE PROCEDURE public.sdo_partition_function();
    END IF;
END;
$FLYWAY$
