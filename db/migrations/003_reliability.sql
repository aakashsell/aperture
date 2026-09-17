ALTER TABLE experiments ADD COLUMN IF NOT EXISTS hypothesis TEXT NOT NULL DEFAULT '';
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS winner_variant_id INTEGER REFERENCES variants(id);
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS attribution_days INTEGER NOT NULL DEFAULT 7;
CREATE TABLE IF NOT EXISTS worker_health (id INTEGER PRIMARY KEY CHECK (id = 1), updated_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS idx_exposures_experiment_variant ON exposures(experiment_id, variant_id);
