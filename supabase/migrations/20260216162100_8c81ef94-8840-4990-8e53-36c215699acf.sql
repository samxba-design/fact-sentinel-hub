
-- Table for ignored/blocked source domains per org
CREATE TABLE public.ignored_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(org_id, domain)
);

ALTER TABLE public.ignored_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view ignored sources"
ON public.ignored_sources FOR SELECT
USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "Org members can manage ignored sources"
ON public.ignored_sources FOR INSERT
WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "Org members can delete ignored sources"
ON public.ignored_sources FOR DELETE
USING (public.is_org_member(org_id, auth.uid()));
