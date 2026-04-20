-- mention_notes: analyst notes / comments on individual mentions
CREATE TABLE IF NOT EXISTS public.mention_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mention_id  UUID NOT NULL REFERENCES public.mentions(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  note_type   TEXT NOT NULL DEFAULT 'comment', -- comment | flag | action | context
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mention_notes_mention_id_idx ON public.mention_notes(mention_id);
CREATE INDEX IF NOT EXISTS mention_notes_org_id_idx ON public.mention_notes(org_id);

ALTER TABLE public.mention_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View org mention notes"
  ON public.mention_notes FOR SELECT TO authenticated
  USING (org_id IN (
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid()
  ));

CREATE POLICY "Insert org mention notes"
  ON public.mention_notes FOR INSERT TO authenticated
  WITH CHECK (org_id IN (
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid()
  ));

CREATE POLICY "Update own mention notes"
  ON public.mention_notes FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Delete own mention notes"
  ON public.mention_notes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- related_mentions: explicit links between mentions (cross-platform, same story etc.)
CREATE TABLE IF NOT EXISTS public.related_mentions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mention_id  UUID NOT NULL REFERENCES public.mentions(id) ON DELETE CASCADE,
  related_id  UUID NOT NULL REFERENCES public.mentions(id) ON DELETE CASCADE,
  relation    TEXT NOT NULL DEFAULT 'related', -- related | same_story | amplification | response | contradiction
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mention_id, related_id)
);

CREATE INDEX IF NOT EXISTS related_mentions_mention_id_idx ON public.related_mentions(mention_id);
CREATE INDEX IF NOT EXISTS related_mentions_related_id_idx ON public.related_mentions(related_id);

ALTER TABLE public.related_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View related mentions"
  ON public.related_mentions FOR SELECT TO authenticated
  USING (org_id IN (
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid()
  ));

CREATE POLICY "Manage related mentions"
  ON public.related_mentions FOR ALL TO authenticated
  USING (org_id IN (
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid()
  ))
  WITH CHECK (org_id IN (
    SELECT org_id FROM public.org_memberships WHERE user_id = auth.uid()
  ));

-- Add rescan tracking fields to mentions
ALTER TABLE public.mentions
  ADD COLUMN IF NOT EXISTS last_rescanned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescan_count       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS title              TEXT,
  ADD COLUMN IF NOT EXISTS clean_summary      TEXT,
  ADD COLUMN IF NOT EXISTS gemini_video_analysis JSONB;
