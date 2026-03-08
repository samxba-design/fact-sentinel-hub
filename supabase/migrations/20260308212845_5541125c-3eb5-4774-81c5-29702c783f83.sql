
ALTER TABLE public.org_people 
  ADD COLUMN IF NOT EXISTS impact_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reach_multiplier numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sentiment_impact numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mention_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS negative_ratio numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_scored_at timestamp with time zone;
