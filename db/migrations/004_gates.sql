ALTER TABLE projects ADD COLUMN IF NOT EXISTS telemetry_secret TEXT;

CREATE TABLE IF NOT EXISTS gates (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'off' CHECK (status IN ('off', 'running', 'archived')),
    rollout_basis_points INTEGER NOT NULL DEFAULT 500 CHECK (rollout_basis_points BETWEEN 0 AND 10000),
    allocation_kind TEXT NOT NULL DEFAULT 'anonymous' CHECK (allocation_kind IN ('anonymous', 'user', 'installation', 'device', 'account', 'organization', 'host')),
    salt TEXT NOT NULL,
    config_version INTEGER NOT NULL DEFAULT 1 CHECK (config_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    UNIQUE(project_id, key)
);

CREATE TABLE IF NOT EXISTS gate_changes (
    id BIGSERIAL PRIMARY KEY,
    gate_id INTEGER NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
    config_version INTEGER NOT NULL,
    status TEXT NOT NULL,
    rollout_basis_points INTEGER NOT NULL,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(gate_id, config_version)
);

CREATE TABLE IF NOT EXISTS gate_decisions (
    id BIGSERIAL PRIMARY KEY,
    gate_id INTEGER NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
    allocation_kind TEXT NOT NULL,
    allocation_id_hash TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    config_version INTEGER NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(gate_id, allocation_kind, allocation_id_hash, config_version)
);

CREATE TABLE IF NOT EXISTS gate_exposures (
    id BIGSERIAL PRIMARY KEY,
    gate_id INTEGER NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
    allocation_kind TEXT NOT NULL,
    allocation_id_hash TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    config_version INTEGER NOT NULL,
    first_exposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_exposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exposure_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(gate_id, allocation_kind, allocation_id_hash, config_version)
);

CREATE TABLE IF NOT EXISTS gate_health_events (
    id BIGSERIAL PRIMARY KEY,
    gate_id INTEGER NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    allocation_kind TEXT NOT NULL,
    allocation_id_hash TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    config_version INTEGER NOT NULL,
    name TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'fatal')),
    properties JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(gate_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_gate_decisions_gate_version ON gate_decisions(gate_id, config_version, enabled);
CREATE INDEX IF NOT EXISTS idx_gate_exposures_gate_version ON gate_exposures(gate_id, config_version, enabled);
CREATE INDEX IF NOT EXISTS idx_gate_health_gate_time ON gate_health_events(gate_id, timestamp DESC);
