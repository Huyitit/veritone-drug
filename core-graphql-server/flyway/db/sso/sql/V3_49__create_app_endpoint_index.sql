-- create an index on application event endpoint
CREATE INDEX IF NOT EXISTS "_ix_application@event_endpoint" ON application (event_endpoint) WHERE event_endpoint IS NOT NULL;
