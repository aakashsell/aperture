CREATE TABLE IF NOT EXISTS crash_events (
    id BIGSERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    allocation_kind TEXT NOT NULL,
    allocation_id_hash TEXT NOT NULL,
    gate_key TEXT,
    config_version INTEGER,
    name TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'fatal')),
    exception_type TEXT,
    exception_message TEXT,
    exception_stack TEXT,
    properties JSONB,
    fingerprint TEXT NOT NULL,
    dedupe_window BIGINT NOT NULL,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, allocation_id_hash, fingerprint, dedupe_window)
);

CREATE INDEX IF NOT EXISTS idx_crash_events_project_time ON crash_events(project_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_crash_events_project_allocation ON crash_events(project_id, allocation_id_hash, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS crash_event_receipts (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(project_id, event_id)
);

ALTER TABLE gate_health_events ADD COLUMN IF NOT EXISTS exception_type TEXT;
ALTER TABLE gate_health_events ADD COLUMN IF NOT EXISTS exception_message TEXT;
ALTER TABLE gate_health_events ADD COLUMN IF NOT EXISTS exception_stack TEXT;
