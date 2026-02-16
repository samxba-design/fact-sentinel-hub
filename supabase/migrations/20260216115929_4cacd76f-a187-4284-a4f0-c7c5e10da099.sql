
-- Table for storing per-org API credentials for external data sources
CREATE TABLE public.org_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  key_name TEXT NOT NULL,
  key_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider, key_name)
);

ALTER TABLE public.org_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their API keys"
ON public.org_api_keys FOR SELECT
USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org admins can insert API keys"
ON public.org_api_keys FOR INSERT
WITH CHECK (
  public.has_org_role(auth.uid(), org_id, 'owner') OR
  public.has_org_role(auth.uid(), org_id, 'admin')
);

CREATE POLICY "Org admins can update API keys"
ON public.org_api_keys FOR UPDATE
USING (
  public.has_org_role(auth.uid(), org_id, 'owner') OR
  public.has_org_role(auth.uid(), org_id, 'admin')
);

CREATE POLICY "Org admins can delete API keys"
ON public.org_api_keys FOR DELETE
USING (
  public.has_org_role(auth.uid(), org_id, 'owner') OR
  public.has_org_role(auth.uid(), org_id, 'admin')
);
