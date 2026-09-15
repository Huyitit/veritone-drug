-- Update RT cluster "rt-deadbeef-0000-0001-0001-ba5eba111111" to default cluster
update 	aiware."cluster"
set 	default_cluster = true
where 	cluster_id = 'rt-deadbeef-0000-0001-0001-ba5eba111111';