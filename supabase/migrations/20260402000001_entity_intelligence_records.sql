-- Entity Intelligence Records
-- Tracks manually-added accounts, profiles, websites, communities, channels
-- that represent potential brand risks, media sources, or monitored entities.

CREATE TABLE IF NOT EXISTS public.entity_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identity
  platform              text NOT NULL DEFAULT 'unknown',
  url                   text,
  handle                text,
  display_name          text,
  bio                   text,
  profile_image_url     text,
  known_aliases         text[],
  language              text,
  region                text,

  -- Enrichment data (auto-fetched)
  follower_count        integer,
  following_count       integer,
  verified              boolean,
  account_created_at    text,
  website_in_bio        text,
  recent_posts          jsonb,          -- array of { text, url, date }
  detected_topics       text[],
  engagement_pattern    text,
  linked_entities       text[],
  enrichment_confidence jsonb,          -- { field: confidence_0_to_1 }
  enriched_at           timestamptz,
  enrichment_source     text,

  -- Classification
  source_type           text NOT NULL DEFAULT 'unknown',
  risk_type             text NOT NULL DEFAULT 'none',
  intent_type           text,
  credibility           text,
  relationship_to_brand text,
  ownership_type        text,

  -- Risk scoring
  severity              text NOT NULL DEFAULT 'low',
  confidence            text NOT NULL DEFAULT 'medium',
  status                text NOT NULL DEFAULT 'active',
  action_recommendation text,

  -- Monitoring intent
  monitoring_intent     text,
  watch_keywords        text[],
  alert_enabled         boolean NOT NULL DEFAULT false,
  alert_threshold       text,

  -- Auto-detected risk flags
  risk_flags            jsonb,          -- { flag: boolean, reason: string }

  -- Evidence & context
  evidence_links        jsonb,          -- [{ url, label, archived_url, note }]
  tags                  text[],
  notes                 text,
  reason_added          text,
  claimed_affiliation   text,
  actual_affiliation    text,

  -- Claimed vs AI classification
  ai_suggested_type     text,
  ai_suggested_risk     text,
  ai_suggested_flags    jsonb,
  ai_confidence         float,

  -- Change tracking (snapshot of last enrichment)
  previous_bio          text,
  previous_display_name text,
  previous_handle       text,
  previous_image_url    text,
  previous_verified     boolean,
  changed_fields        text[],

  -- Case linkage
  linked_incident_ids   uuid[],
  linked_narrative_ids  uuid[],
  linked_people_ids     uuid[],

  -- Ownership
  assigned_to           uuid REFERENCES auth.users(id),
  department            text,
  sla_hours             integer,

  -- Audit trail (append-only log stored as jsonb array)
  audit_log             jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Timestamps
  first_seen_at         timestamptz,
  last_seen_at          timestamptz,
  last_activity_at      timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS entity_records_org_id_idx ON public.entity_records(org_id);
CREATE INDEX IF NOT EXISTS entity_records_platform_idx ON public.entity_records(platform);
CREATE INDEX IF NOT EXISTS entity_records_status_idx ON public.entity_records(status);
CREATE INDEX IF NOT EXISTS entity_records_risk_type_idx ON public.entity_records(risk_type);
CREATE INDEX IF NOT EXISTS entity_records_severity_idx ON public.entity_records(severity);
CREATE INDEX IF NOT EXISTS entity_records_url_idx ON public.entity_records(url);

-- RLS
ALTER TABLE public.entity_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_records_org_access" ON public.entity_records
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM public.org_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_entity_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_records_updated_at
  BEFORE UPDATE ON public.entity_records
  FOR EACH ROW EXECUTE FUNCTION update_entity_records_updated_at();
