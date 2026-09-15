CREATE TABLE IF NOT EXISTS attention_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('bill','subscription','appointment','email','travel','commitment')),
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  due_at TIMESTAMPTZ,
  amount NUMERIC(12,2) CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','weekly','monthly','yearly')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('needs_review','open','completed','dismissed')),
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','gmail')),
  source_id TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '',
  detector TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id,kind,source_type,source_id)
);
CREATE INDEX IF NOT EXISTS attention_items_user_due ON attention_items(user_id,status,due_at);
CREATE TABLE IF NOT EXISTS attention_scans (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  source_hash TEXT,
  engine TEXT,
  last_error TEXT
);
