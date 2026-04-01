
ALTER TABLE public.mentions ADD COLUMN IF NOT EXISTS mention_type text NOT NULL DEFAULT 'brand';
ALTER TABLE public.mentions ADD COLUMN IF NOT EXISTS competitor_name text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_mentions_mention_type ON public.mentions(mention_type);
CREATE INDEX IF NOT EXISTS idx_mentions_competitor_name ON public.mentions(competitor_name) WHERE competitor_name IS NOT NULL;
