-- Aperture initial schema

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS experiments (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    primary_metric_id INTEGER,
    activation_event TEXT,
    allocated_percentage INTEGER NOT NULL DEFAULT 100,
    srm_p_value DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, key)
);

CREATE TABLE IF NOT EXISTS variants (
    id SERIAL PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    allocation INTEGER NOT NULL DEFAULT 50,
    is_control BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(experiment_id, key)
);

CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    event_name TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS experiment_metrics (
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    metric_id INTEGER REFERENCES metrics(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (experiment_id, metric_id)
);

CREATE TABLE IF NOT EXISTS assignments (
    id BIGSERIAL PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    variant_id INTEGER REFERENCES variants(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(experiment_id, user_id)
);

CREATE TABLE IF NOT EXISTS overrides (
    id SERIAL PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    variant_id INTEGER REFERENCES variants(id) ON DELETE SET NULL,
    excluded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(experiment_id, user_id)
);

CREATE TABLE IF NOT EXISTS exposures (
    id BIGSERIAL PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    variant_id INTEGER REFERENCES variants(id) ON DELETE CASCADE,
    exposed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(experiment_id, user_id)
);

CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    value DOUBLE PRECISION,
    properties JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, event_id)
);

CREATE INDEX idx_events_project_user ON events(project_id, user_id, event_name, timestamp);
CREATE INDEX idx_events_project_name ON events(project_id, event_name, timestamp);

CREATE TABLE IF NOT EXISTS experiment_user_metrics (
    id BIGSERIAL PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    variant_id INTEGER REFERENCES variants(id) ON DELETE CASCADE,
    metric_id INTEGER REFERENCES metrics(id) ON DELETE CASCADE,
    metric_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(experiment_id, user_id, metric_id)
);

CREATE TABLE IF NOT EXISTS experiment_results (
    id SERIAL PRIMARY KEY,
    experiment_id INTEGER REFERENCES experiments(id) ON DELETE CASCADE,
    metric_id INTEGER REFERENCES metrics(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES variants(id) ON DELETE CASCADE,
    sample_size INTEGER NOT NULL DEFAULT 0,
    mean DOUBLE PRECISION,
    lift DOUBLE PRECISION,
    lift_ci_lower DOUBLE PRECISION,
    lift_ci_upper DOUBLE PRECISION,
    p_value DOUBLE PRECISION,
    mde DOUBLE PRECISION,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(experiment_id, metric_id, variant_id)
);
