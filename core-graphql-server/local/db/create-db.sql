-- Create all the required databases

DROP DATABASE IF EXISTS platform;
CREATE DATABASE platform WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8';
ALTER DATABASE platform SET random_page_cost TO 1;

DROP DATABASE IF EXISTS cms;
CREATE DATABASE cms WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8';
ALTER DATABASE cms SET random_page_cost TO 1;

DROP DATABASE IF EXISTS media_platform;
CREATE DATABASE media_platform WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8';
ALTER DATABASE media_platform SET random_page_cost TO 1;

DROP DATABASE IF EXISTS sso;
CREATE DATABASE sso WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8';
ALTER DATABASE sso SET random_page_cost TO 1;

DROP DATABASE IF EXISTS stats;
CREATE DATABASE stats WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8';
ALTER DATABASE stats SET random_page_cost TO 1;

DROP DATABASE IF EXISTS subscription;
CREATE DATABASE subscription WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8';
ALTER DATABASE subscription SET random_page_cost TO 1;

DROP DATABASE IF EXISTS third_party;
CREATE DATABASE third_party WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8';
ALTER DATABASE third_party SET random_page_cost TO 1;

DROP DATABASE IF EXISTS structured_data;
CREATE DATABASE structured_data WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8';
ALTER DATABASE structured_data SET random_page_cost TO 1;

DROP DATABASE IF EXISTS youtube;
CREATE DATABASE youtube WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8';
ALTER DATABASE youtube SET random_page_cost TO 1;

DROP DATABASE IF EXISTS audience;
CREATE DATABASE audience WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8';
ALTER DATABASE audience SET random_page_cost TO 1;

DROP DATABASE IF EXISTS attribution;
CREATE DATABASE attribution WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8';
ALTER DATABASE attribution SET random_page_cost TO 1;

DROP DATABASE IF EXISTS pganalytics;
CREATE DATABASE pganalytics WITH TEMPLATE = template0 ENCODING = 'UTF8' LC_COLLATE = 'en_US.utf8' LC_CTYPE = 'en_US.utf8';
ALTER DATABASE pganalytics SET random_page_cost TO 1;