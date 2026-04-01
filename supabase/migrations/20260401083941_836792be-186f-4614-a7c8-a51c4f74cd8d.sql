
-- Fix 1: Replace overly permissive anon SELECT on shared_links with a secure RPC
DROP POLICY "Public can read active shared links by token" ON public.shared_links;

CREATE OR REPLACE FUNCTION public.get_shared_link_by_token(_token text)
RETURNS TABLE(org_id uuid, permissions jsonb, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sl.org_id, sl.permissions, sl.is_active
  FROM public.shared_links sl
  WHERE sl.token = _token AND sl.is_active = true
  LIMIT 1;
$$;

-- Fix 2: Restrict topics DELETE and UPDATE to authenticated users only
DROP POLICY "Delete topics" ON public.topics;
DROP POLICY "Update topics" ON public.topics;

CREATE POLICY "Delete topics" ON public.topics
  FOR DELETE TO authenticated
  USING ((org_id IS NULL AND auth.uid() IS NOT NULL) OR is_org_member(auth.uid(), org_id));

CREATE POLICY "Update topics" ON public.topics
  FOR UPDATE TO authenticated
  USING ((org_id IS NULL AND auth.uid() IS NOT NULL) OR is_org_member(auth.uid(), org_id));

-- Fix 3: Tighten organizations INSERT to check user is authenticated (already scoped to authenticated role, but add user check)
DROP POLICY "Authenticated users can create org" ON public.organizations;

CREATE POLICY "Authenticated users can create org" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
