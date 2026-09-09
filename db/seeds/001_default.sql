-- Seed default project
INSERT INTO projects (name, api_key) VALUES ('Default Project', 'aperture_default_key')
ON CONFLICT DO NOTHING;
