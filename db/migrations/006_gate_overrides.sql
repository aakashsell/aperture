CREATE TABLE IF NOT EXISTS gate_overrides (
    gate_id INTEGER NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
    allocation_kind TEXT NOT NULL,
    allocation_id_hash TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(gate_id, allocation_kind, allocation_id_hash)
);

CREATE TABLE IF NOT EXISTS gate_override_changes (
    id BIGSERIAL PRIMARY KEY,
    gate_id INTEGER NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
    allocation_kind TEXT NOT NULL,
    allocation_id_hash TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('force_on', 'force_off', 'remove')),
    enabled BOOLEAN,
    config_version INTEGER NOT NULL,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gate_override_changes_gate_time
    ON gate_override_changes(gate_id, changed_at DESC);
