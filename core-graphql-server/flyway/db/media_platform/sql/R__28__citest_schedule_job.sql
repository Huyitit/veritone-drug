
-- Add media source own by org 7682
INSERT INTO public.media_source (
	media_source_id, 
	media_source_name, 
	media_source_type_id, 
	live_timezone, 
	station_channel,
	radio_station_code,
	radio_stream_url, 
	organization_id, 
	kvp,
	bia_station_code,
	media_source_format_id, 
	station_call_sign, 
	station_band,
	home_market_id,
	is_public, 
	thumbnail_url, 
	state)
VALUES
(67728, 'citest: fer test', 1, 'America/Los_Angeles', 'fm', null, 'balh.com', 7682, '{"sourceFormat":"Country"}', null, 1, 'fer', 'fm', null, false, '', '{}')
ON CONFLICT DO NOTHING;

INSERT INTO public.media_source (
	media_source_id, 
	media_source_name, 
	media_source_type_id, 
	live_timezone, 
	station_channel,
	radio_station_code,
	radio_stream_url, 
	organization_id, 
	kvp,
	bia_station_code,
	media_source_format_id, 
	station_call_sign, 
	station_band,
	home_market_id,
	is_public, 
	thumbnail_url, 
	state)
SELECT
	67981, 'citest: QD-Veritone-CDNTest', 1, 'America/Los_Angeles', '99.7', 'KMVQ-FM', 'http://veritone-3.cdnstream.com/KMVQ-FM', 7682, '{"useStationLocalTime":true,"description":"KMVQ-FM - Bonneville SF - KATZ","frequency":"99.7","webSiteUrl":"http://www.997now.com/","formatId":8,"sourceFormat":"Contemporary Hit Radio/Top 40","automationSystem":"jump2Go"}', 13658, 8, 'KMVQ', 'FM', 169, false, NULL, '{}'
WHERE EXISTS (SELECT * FROM public.market WHERE market_id = 169)
ON CONFLICT DO NOTHING;


INSERT INTO public.media_source (
	media_source_id, 
	media_source_name, 
	media_source_type_id, 
	live_timezone, 
	station_channel,
	radio_station_code,
	radio_stream_url, 
	organization_id, 
	kvp,
	bia_station_code,
	media_source_format_id, 
	station_call_sign, 
	station_band,
	home_market_id,
	is_public, 
	thumbnail_url, 
	state)
SELECT
	68073, 'citest: DEPLOY-WUSF-FM', 1, 'America/New_York', '89', 'WUSF-FM', 'https://17533.live.streamtheworld.com/WUSFFM.mp3', 7682, '{"description":"YOUR NPR STATION","image":"https://s3.amazonaws.com/prod-veritone-ugc/media_sources/9529/W6eoVNkDTFdG4mC3GCAM_11041666_10153164582940119_8722120608489004659_n.jpg","frequency":"89.7","webSiteUrl":"http://www.wusf.usf.edu/","formatId":4,"sourceFormat":"Public/Educational Station"}', 25105, 11, 'WUSF', 'FM', 185, false, 'https://prod-veritone-ugc.s3.amazonaws.com/media_sources/9529/W6eoVNkDTFdG4mC3GCAM_11041666_10153164582940119_8722120608489004659_n.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQMR5VATUHU3MEGOA%2F20200317%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20200317T025843Z&X-Amz-Expires=86400&X-Amz-Signature=16109a9fd17466bfee63038ae16108ef837a8a620d78318732cfb8e5ec8c01cf&X-Amz-SignedHeaders=host', '{}'
WHERE EXISTS (SELECT * FROM public.market WHERE market_id = 185)
ON CONFLICT DO NOTHING;


INSERT INTO public.media_source (
	media_source_id, 
	media_source_name, 
	media_source_type_id, 
	live_timezone, 
	station_channel,
	radio_station_code,
	radio_stream_url, 
	organization_id, 
	kvp,
	bia_station_code,
	media_source_format_id, 
	station_call_sign, 
	station_band,
	home_market_id,
	is_public, 
	thumbnail_url, 
	state)
SELECT
	68074, 'citest: DEPLOY-WUSF-FM', 1, 'America/New_York', '89', 'WUSF-FM', 'https://17533.live.streamtheworld.com/WUSFFM.mp3', 7682, '{"description":"YOUR NPR STATION","image":"https://s3.amazonaws.com/prod-veritone-ugc/media_sources/9529/W6eoVNkDTFdG4mC3GCAM_11041666_10153164582940119_8722120608489004659_n.jpg","frequency":"89.7","webSiteUrl":"http://www.wusf.usf.edu/","formatId":4,"sourceFormat":"Public/Educational Station"}', 25105, 11, 'WUSF', 'FM', 185, false, 'https://prod-veritone-ugc.s3.amazonaws.com/media_sources/9529/W6eoVNkDTFdG4mC3GCAM_11041666_10153164582940119_8722120608489004659_n.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAQMR5VATUHU3MEGOA%2F20200317%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20200317T025838Z&X-Amz-Expires=86400&X-Amz-Signature=093310f68ed8b2a3df8e021f626c7076e4053ffaa2c72a2c1e031acbad54ef32&X-Amz-SignedHeaders=host', '{}'
WHERE EXISTS (SELECT * FROM public.market WHERE market_id = 185)
ON CONFLICT DO NOTHING;