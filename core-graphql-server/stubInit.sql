-- Table: config
-- insert default service config settings
INSERT INTO edge.config (
	config_section, 
	config_key, 
	config_value, 
	kvp, 
	service_id)
SELECT 
	val.config_section, 
	val.config_key, 
	val.config_value, 
	val.kvp, 
	s.service_id
FROM (
VALUES
(edge.type_config_section 'application', text 'applicationName', text 'core-graphql-server', jsonb '{}', 'core-graphql-server'),
('application','apiVersionPath','/v3','{}','core-graphql-server'),
('application','nodeEnv','prod','{}','core-graphql-server'),
('application','port','3000','{}','core-graphql-server'),
('application','allowedOriginHosts',NULL,'{"value":null}','core-graphql-server'),
('application','tmpdir','/tmp','{}','core-graphql-server'),
('application','maxRequestCost','1000','{}','core-graphql-server'),
('application','requireComplexPassword','false','{}','core-graphql-server'),
('application','useMediaTableSourceHack','false','{}','core-graphql-server'),
('application','defaultPmiClusterId','_DEFAULT_PMI_CLUSTER_ID_','{}','core-graphql-server'),
('application','publicDnsZoneName','_PUBLIC_DNS_ZONE_NAME_','{}','core-graphql-server'),
('application','publicDnsZoneName2','_PUBLIC_DNS_ZONE_NAME_2_','{}','core-graphql-server'),
('application','wwwRoot','_WWW_ROOT_','{}','core-graphql-server'),
('application','apiRoot','_API_ROOT_','{}','core-graphql-server'),
('application','storageEndpoint','_STORAGE_ENDPOINT_','{}','core-graphql-server'),
('application','mandrillAPIKey','_MANDRILL_API_KEY_','{}','core-graphql-server'),
('application','signedUrlOverrideEngines','_SIGNED_URL_OVERRIDE_ENGINES_','{}','core-graphql-server'),
('application','enableRequestEntryLog','false','{}','core-graphql-server'),
('application','taskTypeCacheRefreshIntervalMs','120000','{}','core-graphql-server'),
('application','notifyOnUploadFailures','false','{}','core-graphql-server'),
('application','taskTablePartitionActiveDate','2021-03-13T03:42:14.693Z','{}','core-graphql-server'),
('application','jobTablePartitionActiveDate','2021-03-13T03:42:14.694Z','{}','core-graphql-server'),
('application','sharedUrlPartitionActiveDate','2021-03-13T03:42:14.694Z','{}','core-graphql-server'),
('application','recordingAssetTablePartitionActiveDate','2021-03-13T03:42:14.694Z','{}','core-graphql-server'),
('application','defaultRealTimeCluster',NULL,'{}','core-graphql-server'),
('application','mediaFormats','_MEDIA_FORMATS_','{}','core-graphql-server'),
('application','auth.jwtCookieName','_AUTH__JWT_COOKIE_NAME_','{}','core-graphql-server'),
('application','auth.jwtRefreshCookieName','_AUTH__JWT_REFRESH_COOKIE_NAME_','{}','core-graphql-server'),
('application','auth.userTokenCookieName','_AUTH__USER_TOKEN_COOKIE_NAME_','{}','core-graphql-server'),
('application','auth.useInsecureCookie','false','{}','core-graphql-server'),
('application','metricsRange.defaultRange','30','{}','core-graphql-server'),
('application','metricsRange.maxRange','90','{}','core-graphql-server'),
('application','server.heartbeatEnabled','true','{}','core-graphql-server'),
('application','server.redisHeartbeatEnabled','true','{}','core-graphql-server'),
('application','server.maxRequestCost','1000','{}','core-graphql-server'),
('application','server.uploadSizeLimit','1073741824','{}','core-graphql-server'),
('application','server.disableGlobalRequestSizeLimit','false','{}','core-graphql-server'),
('application','cache.stdTTLSec','30','{}','core-graphql-server'),
('application','cache.checkPeriodSec','30','{}','core-graphql-server'),
('application','aiware.enabled','false','{}','core-graphql-server'),
('application','aiware.organizationApplicationId','_AIWARE__ORGANIZATION_APPLICATION_ID_','{}','core-graphql-server'),
('application','aiware.clusterMemoryLimit','0','{}','core-graphql-server'),
('application','log.level','warn','{}','core-graphql-server'),
('application','dnsZone.external','_DNS_ZONE__EXTERNAL_','{}','core-graphql-server'),
('application','jwt.secret','_JWT__SECRET_','{}','core-graphql-server'),
('application','jwt.ttl','7d','{}','core-graphql-server'),
('application','jwt.sdoTokenTtlSec','3600','{}','core-graphql-server'),
('application','queue.nsqd','_QUEUE__NSQD_','{}','core-graphql-server'),
('application','queue.nsqlookupdDiscovery','false','{}','core-graphql-server'),
('application','messaging.enable','true','{}','core-graphql-server'),
('application','messaging.name','nsq','{}','core-graphql-server'),
('application','messaging.maxInFlight','1000','{}','core-graphql-server'),
('application','s3.region','us-east-1','{}','core-graphql-server'),
('application','s3.bucket','_S_3__BUCKET_','{}','core-graphql-server'),
('application','s3.buildTestReportBucket','_S_3__BUILD_TEST_REPORT_BUCKET_','{}','core-graphql-server'),
('application','s3.buildManifestBucket','_S_3__BUILD_MANIFEST_BUCKET_','{}','core-graphql-server'),
('application','s3.signedUrlExpires','604800','{}','core-graphql-server'),
('application','s3.buckets','_S_3__BUCKETS_','{}','core-graphql-server'),
('application','flyway.migrate','true','{}','core-graphql-server'),
('application','flyway.path','/usr/local/bin/flyway','{}','core-graphql-server'),
('application','flyway.rootOrgId','1','{}','core-graphql-server'),
('application','queryMonitor.enableKill','true','{}','core-graphql-server'),
('application','queryMonitor.queryDurationSecondsKill','30','{}','core-graphql-server'),
('application','queryMonitor.queryDurationSecondsTerminate','60','{}','core-graphql-server'),
('application','services.elasticLogClusterUri','_SERVICES__ELASTIC_LOG_CLUSTER_URI_','{}','core-graphql-server'),
('application','featureFlags.maxTDOAssetLimitWarnOnly','false','{}','core-graphql-server'),
('application','featureFlags.getTDOMetadataFromMediaPlatform','false','{}','core-graphql-server'),
('application','featureFlags.enableNativeMPEGDash','false','{}','core-graphql-server'),
('application','featureFlags.signedWritableUrlOverride','false','{}','core-graphql-server'),
('application','pageUris.collectionsShareLinkUrl','_PAGE_URIS__COLLECTIONS_SHARE_LINK_URL_','{}','core-graphql-server'),
('application','pageUris.discoveryShareLinkUrl','_PAGE_URIS__DISCOVERY_SHARE_LINK_URL_','{}','core-graphql-server'),
('application','recordingWeekConfig.weeklyIdsDateActive','_RECORDING_WEEK_CONFIG__WEEKLY_IDS_DATE_ACTIVE_','{}','core-graphql-server'),
('application','recordingWeekConfig.weekOffset','0','{}','core-graphql-server'),
('application','server.rateLimit.intervalRequestLimit','1000','{}','core-graphql-server'),
('application','server.rateLimit.tokenRequestLimit','100','{}','core-graphql-server'),
('application','aiware.defaultCluster.name','_AIWARE__DEFAULT_CLUSTER_NAME_','{}','core-graphql-server'),
('application','aiware.defaultCluster.memory','0','{}','core-graphql-server'),
('application','aiware.defaultCluster.disk','0','{}','core-graphql-server'),
('application','services.core-search-server.token','_SERVICES__CORE_SEARCH_SERVER_TOKEN_','{}','core-graphql-server'),
('application','engineRuntime.iron.token','_ENGINE_RUNTIME__IRON_TOKEN_','{}','core-graphql-server'),
('application','engineRuntime.iron.projectId','_ENGINE_RUNTIME__IRON_PROJECT_ID_','{}','core-graphql-server'),
('application','rateLimit.tokenType.default','5000','{}','core-graphql-server'),
('application','engineRuntime.iron.defaultRuntime.cluster','_ENGINE_RUNTIME__IRON_DEFAULT_RUNTIME_CLUSTER_','{}','core-graphql-server')
) val (
	config_section,
	config_key,
	config_value,
	kvp,
	service_name
)
JOIN edge.service s USING (service_name)
ON CONFLICT DO NOTHING;

-- Table: resource
-- insert required resource definitions 
INSERT INTO edge.resource(
	resource_type,
	name,
	binding_type)
VALUES 
('nsq','aiware_core:messaging','internal_server_type'),
('minio','aiware_core:minio','internal_host'),
('redis','aiware_core:coreAdminRedis','internal_host'),
('redis','aiware_core:redis','internal_host'),
('postgres','aiware_core:audience','internal_host'),
('postgres','aiware_core:audience:read','internal_host'),
('postgres','aiware_core:cms','internal_host'),
('postgres','aiware_core:cms:read','internal_host'),
('postgres','aiware_core:core','internal_host'),
('postgres','aiware_core:core:read','internal_host'),
('postgres','aiware_core:core_gqm','internal_host'),
('postgres','aiware_core:media_platform','internal_host'),
('postgres','aiware_core:media_platform:read','internal_host'),
('postgres','aiware_core:media_platform_gqm','internal_host'),
('postgres','aiware_core:sso','internal_host'),
('postgres','aiware_core:sso:read','internal_host'),
('postgres','aiware_core:subscription','internal_host'),
('postgres','aiware_core:subscription:read','internal_host'),
('postgres','aiware_core:third_party','internal_host'),
('postgres','aiware_core:third_party:read','internal_host'),
('postgres','aiware_core:third_party_gqm','internal_host'),
('es','aiware_core:elastic','internal_host')
ON CONFLICT DO NOTHING;
	

-- Table: resource_mapping
-- insert required resource mappings and options for for the service
INSERT INTO edge.resource_mapping (
	resource_id, 
	service_id, 
	pg_user, 
	pg_pass_enc,
	redis_token
)
SELECT 
	r.resource_id, 
	s.service_id,
	val.pg_user, 
	val.pg_pass_enc,
	val.redis_token
FROM (
VALUES
('aiware_core:messaging', 'core-graphql-server', null, null, null),
('aiware_core:minio', 'core-graphql-server', null, null, null),
('aiware_core:coreAdminRedis', 'core-graphql-server', null, null, ''),
('aiware_core:redis', 'core-graphql-server', null, null, ''),
('aiware_core:audience', 'core-graphql-server', 'postgres', 'postgres', null),
('aiware_core:audience:read', 'core-graphql-server', 'readonly', 'postgres', null),
('aiware_core:cms', 'core-graphql-server', 'postgres', 'postgres', null),
('aiware_core:cms:read', 'core-graphql-server', 'readonly', 'postgres', null),
('aiware_core:core', 'core-graphql-server', 'postgres', 'postgres', null),
('aiware_core:core:read', 'core-graphql-server', 'readonly', 'postgres', null),
('aiware_core:core_gqm', 'core-graphql-server', 'postgres', 'postgres', null),
('aiware_core:media_platform', 'core-graphql-server', 'postgres', 'postgres', null),
('aiware_core:media_platform:read', 'core-graphql-server', 'readonly', 'postgres', null),
('aiware_core:media_platform_gqm', 'core-graphql-server', 'postgres', 'postgres', null),
('aiware_core:sso', 'core-graphql-server', 'postgres', 'postgres', null),
('aiware_core:sso:read', 'core-graphql-server', 'readonly', 'postgres', null),
('aiware_core:subscription', 'core-graphql-server', 'postgres', 'postgres', null),
('aiware_core:subscription:read', 'core-graphql-server', 'readonly', 'postgres', null),
('aiware_core:third_party', 'core-graphql-server', 'postgres', 'postgres', null),
('aiware_core:third_party:read', 'core-graphql-server', 'readonly', 'postgres', null),
('aiware_core:third_party_gqm', 'core-graphql-server', 'postgres', 'postgres', null),
('aiware_core:elastic', 'core-graphql-server', null, null, null)
) val (
	name,
	service_name,
	pg_user,
	pg_pass_enc,
	redis_token
)
JOIN edge.service s USING (service_name)
join edge.resource r using (name)
ON CONFLICT DO NOTHING;

-- Table: config
-- insert default service config settings
INSERT INTO edge.config (
	config_section, 
	config_key, 
	config_value, 
	kvp, 
	service_id)
SELECT 
	val.config_section, 
	val.config_key, 
	val.config_value, 
	val.kvp, 
	s.service_id
FROM (
VALUES
(edge.type_config_section 'application', text 'featureFlags.rateLimitOnUnhealthyServer', text 'false', jsonb '{}', 'aiware-core-service'),
('application','featureFlags.redisCacheEnabled','true','{}','aiware-core-service'),
('application','featureFlags.enforceWatchlistRangeLimits','true','{}','aiware-core-service'),
('application','featureFlags.sharedMention','true','{}','aiware-core-service'),
('application','featureFlags.allowSharedMentionById','true','{}','aiware-core-service'),
('application','featureFlags.sdRestEndpoint','true','{}','aiware-core-service'),
('application','featureFlags.adminEndpoint','true','{}','aiware-core-service'),
('application','featureFlags.enableClusterPreference','true','{}','aiware-core-service'),
('application','featureFlags.maxTDOAssetLimitWarnOnly','true','{}','aiware-core-service'),
('application','featureFlags.getTDOMetadataFromMediaPlatform','true','{}','aiware-core-service'),
('application','featureFlags.enabledAWSUrlSignErrorHandling','false','{}','aiware-core-service'),
('application','featureFlags.useNewUpdateTask','true','{}','aiware-core-service'),
('application','featureFlags.defaultTimezoneOffset','false','{}','aiware-core-service'),
('application','featureFlags.errorOnMessageFailure','true','{}','aiware-core-service'),
('application','featureFlags.maxSharedMentionId','0','{}','aiware-core-service')
) val (
	config_section,
	config_key,
	config_value,
	kvp,
	service_name
)
JOIN edge.service s USING (service_name)
ON CONFLICT DO NOTHING;

-- Table: resource
-- insert required resource definitions 
INSERT INTO edge.resource(
	resource_type,
	name,
	binding_type)
VALUES 

ON CONFLICT DO NOTHING;
	

-- Table: resource_mapping
-- insert required resource mappings and options for for the service
INSERT INTO edge.resource_mapping (
	resource_id, 
	service_id, 
	pg_user, 
	pg_pass_enc,
	redis_token
)
SELECT 
	r.resource_id, 
	s.service_id,
	val.pg_user, 
	val.pg_pass_enc,
	val.redis_token
FROM (
VALUES

) val (
	name,
	service_name,
	pg_user,
	pg_pass_enc,
	redis_token
)
JOIN edge.service s USING (service_name)
join edge.resource r using (name)
ON CONFLICT DO NOTHING;
