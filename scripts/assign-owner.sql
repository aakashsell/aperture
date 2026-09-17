-- Administrative migration for an existing ownerless project. Never exposed as an API.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v project_id=1 -v user_email=you@example.com -f scripts/assign-owner.sql
UPDATE projects SET owner_id = users.id
FROM users
WHERE projects.id = :'project_id'::integer
  AND projects.owner_id IS NULL
  AND users.email = :'user_email'
RETURNING projects.id, projects.name, users.email;
