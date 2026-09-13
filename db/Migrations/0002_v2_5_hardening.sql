
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS csrf_hash TEXT;
UPDATE sessions SET csrf_hash=encode(digest(gen_random_uuid()::text,'sha256'),'hex') WHERE csrf_hash IS NULL;
ALTER TABLE sessions ALTER COLUMN csrf_hash SET NOT NULL;

ALTER TABLE approvals ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS execution_result JSONB;
