UPDATE event_trigger."event" 
SET	schema_data = 'message MentionGenerateWatchlistCompleted {
	    int64 watchlist_id = 10;
	    uint32 mention_count = 16;
			string user_id = 19;
			string watchlist_name = 21;
	  }'
WHERE 	event_name = 'MentionGenerateWatchlistCompleted'
	AND event_type = 'watchlist'
	AND application_id = 'system';