UPDATE event_trigger."event" 
SET	schema_data = 'message MentionGenerateWatchlistCompleted {
	    int64 watchlist_id = 10;
	    uint32 mention_count = 16;
			string user_id = 19;
	  }',
	 schema_hash = 'fbbdd844fc936c457eb54c7f5b62a9bdc47c1244dd1024afd83ed7fcfda9d6cc'
WHERE 	event_name = 'MentionGenerateWatchlistCompleted'
	AND event_type = 'watchlist'
	AND application_id = 'system';