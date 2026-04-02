
CREATE TABLE public.entity_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform TEXT,
  url TEXT,
  handle TEXT,
  display_name TEXT,
  bio TEXT,
  profile_image_url TEXT,
  follower_count INTEGER,
  following_count INTEGER,
  verified BOOLEAN DEFAULT false,
  account_created_at TIMESTAMPTZ,
  region TEXT,
  language TEXT,
  website_in_bio TEXT,
  detected_topics TEXT[],
  recent_posts JSONB,
  engagement_pattern TEXT,
  source_type TEXT,
  risk_type TEXT,
  intent_type TEXT,
  credibility TEXT,
  relationship_to_brand TEXT,
  ownership_type TEXT,
  severity TEXT DEFAULT 'low',
  confidence TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'new',
  action_recommendation TEXT,
  monitoring_intent TEXT,
  watch_keywords TEXT[],
  alert_enabled BOOLEAN DEFAULT false,
  risk_flags JSONB,
  ai_suggested_type TEXT,
  ai_suggested_risk TEXT,
  ai_suggested_flags JSONB,
  ai_confidence NUMERIC,
  enrichment_confidence JSONB,
  enriched_at TIMESTAMPTZ,
  tags TEXT[],
  notes TEXT,
  reason_added TEXT,
  claimed_affiliation TEXT,
  actual_affiliation TEXT,
  known_aliases TEXT[],
  evidence_links JSONB,
  linked_incident_ids UUID[],
  linked_narrative_ids UUID[],
  linked_people_ids UUID[],
  audit_log JSONB,
  why_flagged TEXT[],
  changed_fields TEXT[],
  first_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.entity_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org entity_records"
  ON public.entity_records FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "Members can insert org entity_records"
  ON public.entity_records FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "Members can update org entity_records"
  ON public.entity_records FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "Members can delete org entity_records"
  ON public.entity_records FOR DELETE TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
