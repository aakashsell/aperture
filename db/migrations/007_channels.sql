CREATE TABLE IF NOT EXISTS channels (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    allocation_kind TEXT NOT NULL CHECK (allocation_kind IN ('anonymous','user','installation','device','account','organization','host')),
    fill_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (fill_basis_points BETWEEN 0 AND 10000),
    salt TEXT NOT NULL,
    config_version INTEGER NOT NULL DEFAULT 1 CHECK (config_version > 0),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id,key),
    UNIQUE(project_id,id)
);

CREATE TABLE IF NOT EXISTS channel_members (
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    allocation_kind TEXT NOT NULL,
    allocation_id_hash TEXT NOT NULL,
    added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(channel_id,allocation_kind,allocation_id_hash)
);

CREATE TABLE IF NOT EXISTS channel_member_changes (
    id BIGSERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    allocation_kind TEXT NOT NULL,
    allocation_id_hash TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('add','remove')),
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channel_config_changes (
    id BIGSERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    config_version INTEGER NOT NULL,
    fill_basis_points INTEGER NOT NULL,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(channel_id,config_version)
);

ALTER TABLE gates ADD COLUMN IF NOT EXISTS channel_id INTEGER;
DO $$ BEGIN
    ALTER TABLE gates ADD CONSTRAINT gates_channel_project_fk
        FOREIGN KEY(project_id,channel_id) REFERENCES channels(project_id,id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_channel_members_lookup ON channel_members(channel_id,allocation_kind,allocation_id_hash);
