-- Seq Scan on event_subscription es  (cost=0.00..12167.80 rows=1 width=16)
-- Index Scan using idx_event_subscription_condition on event_subscription es  (cost=0.41..2.44 rows=1 width=16)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_subscription_condition
    ON event_trigger.event_subscription (event_type, (conditions -> 'conditions' -> 0 ->> 'field'),(conditions -> 'conditions' -> 0 ->> 'value'));
