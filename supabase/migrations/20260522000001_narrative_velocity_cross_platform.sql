-- Narrative Velocity Tracking
ALTER TABLE public.narratives ADD COLUMN IF NOT EXISTS velocity NUMERIC(5,2) DEFAULT 0;
ALTER TABLE public.narratives ADD COLUMN IF NOT EXISTS momentum_score NUMERIC(4,2) DEFAULT 0;
ALTER TABLE public.narratives ADD COLUMN IF NOT EXISTS mention_count_history JSONB DEFAULT '[]';
ALTER TABLE public.narratives ADD COLUMN IF NOT EXISTS source_breakdown JSONB DEFAULT '{}';
ALTER TABLE public.narratives ADD COLUMN IF NOT EXISTS cross_platform BOOLEAN DEFAULT FALSE;
ALTER TABLE public.narratives ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT;

-- Source type extension: regulatory, telegram, discord
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS config_notes TEXT;

-- Cross-platform alert log
CREATE TABLE IF NOT EXISTS public.cross_platform_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  narrative_id UUID REFERENCES public.narratives(id) ON DELETE SET NULL,
  fingerprint_hash TEXT,
  title TEXT NOT NULL,
  description TEXT,
  sources TEXT[] DEFAULT '{}',
  mention_count INTEGER DEFAULT 0,
  severity TEXT DEFAULT 'medium',
  resolved BOOLEAN DEFAULT FALSE,
  alerted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cross_platform_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "org members manage cross_platform_alerts"
  ON public.cross_platform_alerts FOR ALL
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS cpa_org_idx ON public.cross_platform_alerts(org_id);
CREATE INDEX IF NOT EXISTS cpa_narrative_idx ON public.cross_platform_alerts(narrative_id);
CREATE INDEX IF NOT EXISTS cpa_fingerprint_idx ON public.cross_platform_alerts(fingerprint_hash);
CREATE INDEX IF NOT EXISTS cpa_resolved_idx ON public.cross_platform_alerts(org_id, resolved);

-- Source type check update for new scanner types
ALTER TABLE public.sources DROP CONSTRAINT IF EXISTS sources_type_check;
ALTER TABLE public.sources ADD CONSTRAINT sources_type_check 
  CHECK (type IN ('news','google-news','bing-news','reddit','twitter','youtube','reviews','blogs','forums','hackernews','brave','newsapi','firecrawl','regulatory','telegram','discord','custom'));