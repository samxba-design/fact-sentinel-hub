
-- Shared view-only links with granular permissions
CREATE TABLE public.shared_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  label TEXT,
  permissions JSONB NOT NULL DEFAULT '{"monitoring": true, "intelligence": true, "operations": true, "assets": true}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shared_links_token ON public.shared_links(token) WHERE is_active = true;
CREATE INDEX idx_shared_links_org_id ON public.shared_links(org_id);

ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view shared links"
ON public.shared_links FOR SELECT
TO authenticated
USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Admins can create shared links"
ON public.shared_links FOR INSERT
TO authenticated
WITH CHECK (
  public.has_org_role(auth.uid(), org_id, 'admin'::app_role) OR
  public.has_org_role(auth.uid(), org_id, 'owner'::app_role)
);

CREATE POLICY "Admins can update shared links"
ON public.shared_links FOR UPDATE
TO authenticated
USING (
  public.has_org_role(auth.uid(), org_id, 'admin'::app_role) OR
  public.has_org_role(auth.uid(), org_id, 'owner'::app_role)
);

CREATE POLICY "Admins can delete shared links"
ON public.shared_links FOR DELETE
TO authenticated
USING (
  public.has_org_role(auth.uid(), org_id, 'admin'::app_role) OR
  public.has_org_role(auth.uid(), org_id, 'owner'::app_role)
);

CREATE POLICY "Public can read active shared links by token"
ON public.shared_links FOR SELECT
TO anon
USING (is_active = true);

CREATE TRIGGER update_shared_links_updated_at
BEFORE UPDATE ON public.shared_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
