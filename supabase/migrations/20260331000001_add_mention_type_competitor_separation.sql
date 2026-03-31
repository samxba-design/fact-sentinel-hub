-- Add mention_type to distinguish brand vs competitor mentions
-- 'brand' = about your own org, 'competitor' = about a tracked competitor
ALTER TABLE mentions ADD COLUMN IF NOT EXISTS mention_type text NOT NULL DEFAULT 'brand';
ALTER TABLE mentions ADD CONSTRAINT mentions_mention_type_check 
  CHECK (mention_type IN ('brand', 'competitor', 'risk', 'other'));

-- Index for fast filtering (dashboard, narratives, risk all filter by brand only)
CREATE INDEX IF NOT EXISTS idx_mentions_org_type ON mentions(org_id, mention_type);
CREATE INDEX IF NOT EXISTS idx_mentions_org_type_posted ON mentions(org_id, mention_type, posted_at DESC NULLS LAST);

-- Also add competitor_name column so we know which competitor it belongs to
ALTER TABLE mentions ADD COLUMN IF NOT EXISTS competitor_name text DEFAULT NULL;

COMMENT ON COLUMN mentions.mention_type IS 'brand = about your org, competitor = about a tracked competitor';
COMMENT ON COLUMN mentions.competitor_name IS 'Which competitor this mention is about (null for brand mentions)';
