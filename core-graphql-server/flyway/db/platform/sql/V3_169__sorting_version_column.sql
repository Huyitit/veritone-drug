CREATE COLLATION IF NOT EXISTS numeric (PROVIDER = icu, LOCALE = 'en-u-kn-true');

ALTER TABLE aiware.aiware_version ALTER COLUMN version SET DATA TYPE VARCHAR COLLATE "numeric";
