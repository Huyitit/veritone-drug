INSERT INTO organization (
    organization_id,
    organization_name,
    kvp,
    date_created,
    date_modified,
    seat_limit,
    status,
    business_unit,
    admin_seat_limit
) SELECT
    14525,
    '5/13 Test Org 12:02PM',
    '{"platformType":"custom","applicationIds":["32babe30-fb42-11e4-89bc-27b69865858a","8a37c1d0-3f3b-48d0-a84e-2b8e3646fbe5","cc4e0e89-3420-49c2-b06d-8d9a929c941c","ea1d26ab-0d29-4e97-8ae7-d998a243374e","2fea6db8-87b9-4118-b0df-ac176f5538de"],"dataSources":["arbitron"],"features":{"media":"enabled","mentionListing":{"comments":true,"edit":true,"ratings":false,"socialSharing":false},"notifications":{"email":true,"sms":true},"shareMentions":{"email":true,"twitter":true,"facebook":true,"link":true,"embed":true},"postToCollections":"enabled","shareCollections":{"internal":"enabled"},"ratings":"enabled","sendMentionsToSalesForce":"enabled","sendMentionsToWebService":"enabled","includeDataSources":"enabled","complianceStatus":"disabled","mediaRights":{"shareWithPlatform":false,"shareWithSpecificAccounts":false},"termsAgreementNotRequired":false,"passwordExpirationDays":90,"openPrivateWatchlistByDefault":"disabled","watchlistLimits":{"maximumMentionCount":10000,"maximumStartAgeDays":180}},"metadata":{"fields":[]},"customCmsAndAclApplicationIds":["32babe30-fb42-11e4-89bc-27b69865858a","2fea6db8-87b9-4118-b0df-ac176f5538de"]}',
    '2017-05-13 19:03:02.988003',
    '2019-03-06 23:48:47.28603',
    null,
    'active',
    'Media',
    4
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;
    
 INSERT INTO organization (
    organization_id,
    organization_name,
    kvp,
    date_created,
    date_modified,
    seat_limit,
    status,
    business_unit,
    admin_seat_limit
) SELECT
    14954,
    '10/4/2017 - Test Orgs',
    '{"platformType":"custom","applicationIds":["7f402a84-4ae6-451f-85ca-9447397610b7","e3c8088c-dd57-42f6-a7ec-be800ec9ba8c"],"dataSources":[],"features":{"media":"disabled","mentionListing":{"comments":true,"edit":true,"ratings":false,"socialSharing":true},"notifications":{"email":true,"sms":true},"shareMentions":{"email":true,"twitter":true,"facebook":true,"link":true,"embed":true},"showGuestMentionDownloadOption":"disabled","postToCollections":"enabled","shareCollections":{"internal":"enabled","external":"enabled"},"ratings":"enabled","sendMentionsToSalesForce":"disabled","sendMentionsToWebService":"enabled","includeDataSources":"enabled","complianceStatus":"disabled","mediaRights":{"shareWithPlatform":false,"shareWithSpecificAccounts":false},"termsAgreementNotRequired":false,"passwordExpirationDays":90,"discoveryFilters":"media","globalMedia":"enabled","privateMedia":"enabled","filters":"enabled","showProgramFilters":"enabled","showStationFilters":"enabled","showMarketFilters":"enabled","socialMediaSharing":"enabled","displayMyMediaIndexOptions":"enabled","loginUsersToDiscovery":"enabled","hideEnginePricing":"enabled","hideTranscriptOnSharing":"enabled","clipshow":"enabled","downloadMedia":"enabled","canVerifyMentions":"enabled","displayMentionsHitsForWatchlists":"enabled","mentionExport":"enabled","mentionCount":"enabled","allowWatchlistShare":"enabled","openPrivateWatchlistByDefault":"disabled","mediaHierarchy":{"levels":["FILE"],"defaultLevel":"FILE"},"enablePasswordRestriction":true,"indexing":{}},"metadata":{"fields":[]},"customCmsAndAclApplicationIds":["7f402a84-4ae6-451f-85ca-9447397610b7","e3c8088c-dd57-42f6-a7ec-be800ec9ba8c"],"conductor":[{"categoryType":"transcript","settings":{"selectedEngines":[],"maxCostRateUSD":"0.01","maxProcessingLimitInHr":1,"languages":[],"scheduleDuration":0,"scheduleInterval":0}}]}',
    '2017-10-04 21:25:09.551522',
    '2019-09-11 04:17:16.533445',
    null,
    'active',
    'DSRD',
    null
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;

-- Source for citests
INSERT INTO media_source (
    media_source_id,
    media_source_name,
    media_source_type_id,
    live_timezone,
    youtube_channel_url,
    radio_station_code,
    radio_stream_url,
    organization_id,
    salesforce_id,
    kvp,
    date_created,
    date_modified,
    youtube_channel_id,
    is_public
) SELECT
    23355, 'MinutePhysics Channel', 3, 'America/Los_Angeles', 'https://www.youtube.com/channel/UCUHW94eEFW7hkUMVaZz4eDg', null, null, 7682, null,
    '{"url": "https://www.youtube.com/channel/UCUHW94eEFW7hkUMVaZz4eDg", "image": "https://s3.amazonaws.com/prod-veritone-ugc/media_sources/23355/L4gVXeET2Qp7vPM6vuFQ_mp1.JPG", "description": "Simply put: cool physics and other sweet science.\n\"If you can''t explain it simply, you don''t understand it well enough.\"\n~Rutherford via Einstein? (wikiquote)\nCreated by Henry Reich"}',
    '2015-03-31 14:36:13.530044', '2018-10-01 18:39:09.816409', 'UCUHW94eEFW7hkUMVaZz4eDg', true
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;

INSERT INTO media_source (
    media_source_id,
    media_source_name,
    media_source_type_id,
    live_timezone,
    youtube_channel_url,
    radio_station_code,
    radio_stream_url,
    organization_id,
    salesforce_id,
    kvp,
    date_created,
    date_modified,
    youtube_channel_id,
    is_public
) SELECT 
    179, 'Car and Driver Magazine', 3, 'America/Los_Angeles', 'https://www.youtube.com/channel/UCOqhTsqySBCBTy571GArcXg', 'Car and Driver Magazine', null, 7682, 'a01i000000FCRQDAA5', 
    '{"url": "https://www.youtube.com/channel/UCOqhTsqySBCBTy571GArcXg", "image": "https://s3.amazonaws.com/prod-veritone-ugc/media_sources/179/LvrKkwYSQSSb0YxUMXIs_CarAndDriver.jpg"}',
    '2014-12-01 18:17:20.675075', '2018-07-13 20:28:01.835318', 'UCOqhTsqySBCBTy571GArcXg', true
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;

INSERT INTO media_source (
    media_source_id,
    media_source_name,
    media_source_type_id,
    live_timezone,
    station_channel,
    radio_station_code,
    radio_stream_url,
    organization_id,
    salesforce_id,
    kvp,
    bia_station_code,
    media_source_format_id,
    station_call_sign,
    station_band,
    home_market_id,
    date_created,
    date_modified,
    state_id,
    is_public
) SELECT
    173,
    'KLAC-AM',
    1,
    'America/Los_Angeles',
    '570',
    'KLAC-AM',
    'http://c8icyelb.prod.playlists.ihrhls.com/189_icy',
    7682,
    'a01i0000007MAVWAA4',
    '{"description":"AM 570  L A SPORTS","image":"https://s3.amazonaws.com/prod-veritone-ugc/media_sources/173/B6i9BIplSFqLfRcFGHgn_F1Xbs-Dq_400x400.jpeg"}',
    20174,
    14,
    'RLAC',
    'AM',
    112,
    '2014-12-01 18:17:20.675075',
    '2017-10-13 19:49:35.330698',
    5,
    true
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
    AND EXISTS (SELECT * FROM public.market WHERE market_id = 185)
ON CONFLICT DO NOTHING;

INSERT INTO media_source (
    media_source_id,
    media_source_name,
    media_source_type_id,
    live_timezone,
    station_channel,
    radio_station_code,
    radio_stream_url,
    organization_id,
    salesforce_id,
    kvp,
    bia_station_code,
    media_source_format_id,
    station_call_sign,
    station_band,
    home_market_id,
    date_created,
    date_modified,
    state_id,
    is_public
) SELECT
    11191,
    'WLXC-FM',
    1,
    'America/New_York',
    '103',
    'WLXC-FM',
    'https://14223.live.streamtheworld.com/WLXCFMAAC_SC',
    7682,
    null,
    '{"description":"BESTVRTYOFR&BHITS&CLSCSOU","webSiteUrl":"http://www.kiss-1031.com/","frequency":"103.1","image":"https://s3.amazonaws.com/prod-veritone-ugc/media_sources/11191/XHvEP6DUTaqllkUmE4bZ_KSSM-Site.png"}',
    20544,
    2,
    'WLXC',
    'FM',
    45,
    '2014-12-01 18:17:20.675075',
    '2018-10-01 18:39:09.662503',
    40,
    true
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
    AND EXISTS (SELECT * FROM public.market WHERE market_id = 185)
ON CONFLICT DO NOTHING;

INSERT INTO media_source (
    media_source_id,
    media_source_name,
    media_source_type_id,
    live_timezone,
    youtube_channel_url,
    radio_station_code,
    radio_stream_url,
    organization_id,
    salesforce_id,
    kvp,
    date_created,
    date_modified,
    youtube_channel_id,
    is_public
) SELECT
    26, 'BET', 2, 'America/Los_Angeles', null, 'BET', 'http://this.is.tv.and.doesnt.have.a.stream.com', 7682, 'a01i000000JopU3AAJ',
    '{"image":"https://s3.amazonaws.com/prod-veritone-ugc/media_sources/26/xFnydD34TtGqOP033n9U_BET_Networks.jpg"}',
    '2014-12-01 18:17:20.675075', '2016-01-18 22:10:23.406252', null, true
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
ON CONFLICT DO NOTHING;

INSERT INTO media_source (
    media_source_id,
    media_source_name,
    media_source_type_id,
    live_timezone,
    station_channel,
    radio_station_code,
    radio_stream_url,
    organization_id,
    salesforce_id,
    kvp,
    bia_station_code,
    media_source_format_id,
    station_call_sign,
    station_band,
    home_market_id,
    date_created,
    date_modified,
    state_id,
    is_public
) SELECT
    12645,
    'WFLA-AM',
    1,
    'America/New_York',
    '970',
    'WFLA-AM',
    'https://c10icy.prod.playlists.ihrhls.com/2823_icy',
    7682,
    null,
    '{"description":"TAMPA BAY''S NEWS RADI0","webSiteUrl":"http://www.970wfla.com/","frequency":"970","image":"https://s3.amazonaws.com/prod-veritone-ugc/media_sources/12645/53dhtg1T8m8IZkkZiszA_wfla_logo_200_7_1389625624.png","formatId":4}',
    15052,
    4,
    'WFLA',
    'AM',
    185,
    '2014-12-01 18:17:20.675075',
    '2018-10-01 18:39:09.662503',
    9,
    true
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
    AND EXISTS (SELECT * FROM public.market WHERE market_id = 185)
ON CONFLICT DO NOTHING;

-- Programs for citests
INSERT INTO program (
    program_id,
    program_name,
    program_description,
    program_image,
    program_live_image,
    program_format_id,
    media_source_type_id,
    organization_id,
    primary_media_source_id,
    recording_status_id,
    program_schedule_id,
    salesforce_id,
    kvp,
    hours_per_week,
    average_weekly_audience,
    date_created,
    date_modified,
    dma_markets,
    dma_affiliates,
    dma_aqh_audience,
    dma_aqh_characteristics,
    is_national,
    is_public,
    is_nationally_syndicated,
    v3_token,
    use_nuance,
    program_sequence,
    v3_job,
    is_active,
    run_mode,
    start_date_time,
    task_data
) SELECT
    1749,
    'The Dan Patrick Show - Premiere Networks - National',
    'The Dan Patrick Show is a syndicated radio and television sports talk show hosted by former ESPN personality Dan Patrick. It is currently produced by DirecTV Sports Networks and is syndicated by Premiere Radio Networks.  The three-hour program debuted on October 1, 2007, and later was added to the Fox Sports Radio national lineup on January 20, 2009. It is broadcast weekdays live beginning at 9 am Eastern.  The show is currently televised on three networks: on DirecTV''s Audience Network (formerly the 101 Network) since August 3, 2009; on three Root Sports affiliates since October 25, 2010; and on NBC Sports Network as of November 5, 2012.  The current show is a successor to the original Dan Patrick Show, which aired from 1999 to 2007 on ESPN Radio weekdays at 1 pm Eastern/10 am Pacific.',
    'https://static.veritone.com/program/dan_patrick.png',
    'https://s3.amazonaws.com/prod-veritone-ugc/programs/1749/L7bFI0hdRZ2pootBHj1h_dan%20patrick%20live.JPG',
    17,
    1,
    7682,
    173,
    3,
    229707,
    'a02i0000009KAp6AAG',
    '{"programFormat":"All Sports"}',
    15,
    1200000,
    '2014-12-01 18:17:19.807936',
    '2019-12-03 04:04:58.255123',
    168,
    212,
    91820,
    '"1"=>"861", "3"=>"15889", "4"=>"22030", "5"=>"11523", "6"=>"10528", "7"=>"10550", "8"=>"449", "10"=>"1472", "11"=>"2328", "12"=>"1213", "13"=>"1240", "14"=>"2666", "15"=>"5526", "82"=>"18161", "254"=>"918", "255"=>"2487", "267"=>"379", "268"=>"326"',
    true,
    true,
    false,
    'aaaaaa:8041bcf372b34b25a1c0edfe633d6da48041bcf372b34b25a1c0edfe633d6da4',
    false,
    0,
    '{
        "tasks": [
            {
                "engineId": "transcribe-speechmatics-container-en-us"
            },
            {
                "engineId": "insert-into-index"
            },
            {
                "engineId": "mention-generate"
            }
        ],
        "migrated": true,
        "migration": {
            "legacyIngestionStatusId": 2
        }
    }',
    false,
    'R',
    '2018-10-28 04:30:32',
    '{
        "engineIds": [
            "insert-into-index",
            "c0e55cde-340b-44d7-bb42-2e0d65e98141",
            "74dfd76b-472a-48f0-8395-c7e01dd7fd24",
            "mention-generate"
        ],
        "clusterIds": [
            "pmi-edge-0003"
        ],
        "engineTypeIds": [
            "fcc22feb-9184-4f53-be5e-7694927864d9",
            "0ab2745b-ca6b-43c9-befd-0ef1d28cb96d"
        ],
        "jobPipelineIds": [],
        "jobTemplateIds": [
            "18104328_MNzCGjP7qY"
        ],
        "engineTypeNames": [
            "Cognition",
            "Ingestion"
        ],
        "numJobTemplates": 1,
        "numTaskTemplates": 4,
        "allJobTemplateIds": [
            "18104328_MNzCGjP7qY"
        ],
        "engineCategoryIds": [
            "4b150c85-82d0-4a18-b7fb-63e4a58dfcce",
            "4fef6040-3fb6-4757-9aae-4044e8b46bc9",
            "67cd4dd0-2f75-445d-a6f0-2f297d6cd182"
        ]
    }'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
    AND EXISTS (SELECT * FROM public.media_source WHERE media_source_id = 173)
ON CONFLICT DO NOTHING;

INSERT INTO program (
    program_id,
    program_name,
    program_description,
    program_image,
    program_live_image,
    program_format_id,
    media_source_type_id,
    organization_id,
    primary_media_source_id,
    recording_status_id,
    program_schedule_id,
    salesforce_id,
    kvp,
    hours_per_week,
    average_weekly_audience,
    date_created,
    date_modified,
    dma_markets,
    dma_affiliates,
    dma_aqh_audience,
    dma_aqh_characteristics,
    is_national,
    is_public,
    is_nationally_syndicated,
    v3_token,
    use_nuance,
    program_sequence,
    v3_job,
    is_active,
    run_mode,
    start_date_time,
    task_data
) SELECT
    1585, 
    'The Tom Joyner Morning Show - REACH Media Inc. - National',
    'The Tom Joyner Morning Show is a nationally-syndicated program, featuring host Tom Joyner and a team of comedians and commentators reporting and discussing the latest news and sports of the day, playing popular R&B songs from the 1970s through the 1990s as well as contemporary R&B hits, and an on-air soap opera, It’s Your World.',
    'https://static.veritone.com/program/tom_joyner.png',
    'https://s3.amazonaws.com/prod-veritone-ugc/programs/1585/oek4nK2Toy1L1zyi35zT_tom%20joyner%20live.JPG',
    40,
    1,
    7682,
    11191,
    3,
    229479,
    'a02i0000009KAowAAG',
    '{"programFormat":"Urban Adult Contemporary"}',
    null,
    null,
    '2014-12-01 18:17:19.807936',
    '2019-12-03 04:04:58.255123',
    98,
    55,
    402246,
    '"1"=>"9306", "3"=>"20304", "4"=>"28495", "5"=>"23498", "6"=>"28047", "7"=>"34974", "8"=>"8325", "10"=>"24045", "11"=>"38137", "12"=>"29472", "13"=>"32188", "14"=>"49833", "15"=>"33958", "82"=>"51466", "254"=>"7346", "255"=>"7677", "267"=>"6420", "268"=>"8527"',
    true,
    true,
    false,
    'aaaaaa:698b492770e44030880408730bf7cadc698b492770e44030880408730bf7cadc',
    null,
    0,
    '{
        "tasks": [
            {
                "engineId": "transcribe-speechmatics-container-en-us"
            },
            {
                "engineId": "insert-into-index"
            },
            {
                "engineId": "mention-generate"
            }
        ],
        "migrated": true,
        "migration": {
            "legacyIngestionStatusId": 2
        }
    }',
    false,
    'R',
    '2018-10-28 04:20:35',
    '{
        "engineIds": [
            "insert-into-index",
            "c0e55cde-340b-44d7-bb42-2e0d65e98141",
            "74dfd76b-472a-48f0-8395-c7e01dd7fd24",
            "mention-generate"
        ],
        "clusterIds": [
            "pmi-edge-0003"
        ],
        "engineTypeIds": [
            "fcc22feb-9184-4f53-be5e-7694927864d9",
            "0ab2745b-ca6b-43c9-befd-0ef1d28cb96d"
        ],
        "jobPipelineIds": [],
        "jobTemplateIds": [
            "18104328_1jul8CCpzO"
        ],
        "engineTypeNames": [
            "Cognition",
            "Ingestion"
        ],
        "numJobTemplates": 1,
        "numTaskTemplates": 4,
        "allJobTemplateIds": [
            "18104328_1jul8CCpzO"
        ],
        "engineCategoryIds": [
            "4b150c85-82d0-4a18-b7fb-63e4a58dfcce",
            "4fef6040-3fb6-4757-9aae-4044e8b46bc9",
            "67cd4dd0-2f75-445d-a6f0-2f297d6cd182"
        ]
    }'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
    AND EXISTS (SELECT * FROM public.media_source WHERE media_source_id = 11191)
ON CONFLICT DO NOTHING;

INSERT INTO program (
    program_id,
    program_name,
    program_description,
    program_image,
    program_live_image,
    program_format_id,
    media_source_type_id,
    organization_id,
    primary_media_source_id,
    recording_status_id,
    program_schedule_id,
    salesforce_id,
    kvp,
    hours_per_week,
    average_weekly_audience,
    date_created,
    date_modified,
    dma_markets,
    dma_affiliates,
    dma_aqh_audience,
    dma_aqh_characteristics,
    is_national,
    is_public,
    is_nationally_syndicated,
    v3_token,
    use_nuance,
    program_sequence,
    v3_job,
    is_active,
    run_mode,
    start_date_time,
    task_data
) SELECT
    1688,
    'Glenn Beck - Premiere Networks - National',
    'The Glenn Beck Radio Program is an American talk radio show hosted by pundit Glenn Beck on Premiere Radio Networks. Since its inception as a nationally syndicated show in 2002, the program has become one of the highest rated radio programs.  Furthermore, it led to a television show on Fox News Channel, six New York Times-bestselling books (five of which debuted at #1), a magazine, and a stage tour. In 2009, many editorials, such as those on The Huffington Post singled out Glenn Beck''s radio and television programs for raising issues which led to the resignation of Obama advisor Van Jones.',
    'https://static.veritone.com/program/glenn_beck.png',
    'https://s3.amazonaws.com/prod-veritone-ugc/programs/1688/qEbFOC3vRam2PPS4jOeX_glenn%20beck%201.JPG',
    12,
    1,
    7682,
    12645,
    3,
    229797,
    'a02i0000009KAntAAG',
    '{"programFormat":"News Talk Information"}',
    null,
    null,
    '2014-12-01 18:17:19.807936',
    '2019-12-03 04:04:58.255123',
    201,
    344,
    79532,
    '"1"=>"1875", "3"=>"10124", "4"=>"11139", "5"=>"13365", "6"=>"9841", "7"=>"21083", "8"=>"1894", "10"=>"4288", "11"=>"9080", "12"=>"3974", "13"=>"4879", "14"=>"11176", "15"=>"20279", "82"=>"18273", "254"=>"3549", "255"=>"4413", "267"=>"1975", "268"=>"2664"',
    true,
    true,
    false,
    'aaaaaa:8041bcf372b34b25a1c0edfe633d6da48041bcf372b34b25a1c0edfe633d6da4',
    false,
    0,
    '{
        "tasks": [
            {
                "engineId": "transcribe-speechmatics-container-en-us"
            },
            {
                "engineId": "insert-into-index"
            },
            {
                "engineId": "mention-generate"
            }
        ],
        "migrated": true,
        "migration": {
            "legacyIngestionStatusId": 2
        }
    }',
    false,
    'R',
    '2018-10-28 04:37:38',
    '{
        "engineIds": [
            "insert-into-index",
            "c0e55cde-340b-44d7-bb42-2e0d65e98141",
            "74dfd76b-472a-48f0-8395-c7e01dd7fd24",
            "mention-generate"
        ],
        "clusterIds": [
            "pmi-edge-0003"
        ],
        "engineTypeIds": [
            "fcc22feb-9184-4f53-be5e-7694927864d9",
            "0ab2745b-ca6b-43c9-befd-0ef1d28cb96d"
        ],
        "jobPipelineIds": [],
        "jobTemplateIds": [
            "18104328_n9lny9EgMA"
        ],
        "engineTypeNames": [
            "Cognition",
            "Ingestion"
        ],
        "numJobTemplates": 1,
        "numTaskTemplates": 4,
        "allJobTemplateIds": [
            "18104328_n9lny9EgMA"
        ],
        "engineCategoryIds": [
            "4b150c85-82d0-4a18-b7fb-63e4a58dfcce",
            "4fef6040-3fb6-4757-9aae-4044e8b46bc9",
            "67cd4dd0-2f75-445d-a6f0-2f297d6cd182"
        ]
    }'
WHERE
    '@@{NODE_ENV}@@' IN ('prod', 'stage', 'dev', 'local', 'uk-prod')
    AND '@@{ENVIRONMENT}@@' <> 'ON_PREM'
    AND '@@{EXTERNAL_DNS_ZONE}@@' LIKE '%us-1.veritone.com'
    AND ('@@{AIWARE_DOMAIN_NAME}@@' IS NULL OR '@@{AIWARE_DOMAIN_NAME}@@' = '')
    AND EXISTS (SELECT * FROM public.media_source WHERE media_source_id = 12645)
ON CONFLICT DO NOTHING;