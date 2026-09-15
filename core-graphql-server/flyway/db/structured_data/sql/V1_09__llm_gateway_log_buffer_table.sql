CREATE TABLE llm_gateway_log_buffer (
    id              BIGSERIAL PRIMARY KEY,
    gateway_call_id TEXT        NOT NULL,
    log_data        TEXT        NOT NULL,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
 );

CREATE UNIQUE INDEX llm_gateway_log_buffer_gateway_call_id_idx
    ON llm_gateway_log_buffer (gateway_call_id);

CREATE INDEX llm_gateway_log_buffer_received_at_idx
    ON llm_gateway_log_buffer (received_at);
