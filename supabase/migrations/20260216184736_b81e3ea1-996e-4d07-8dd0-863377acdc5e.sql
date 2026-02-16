
-- Drop the restrictive INSERT policy and recreate as permissive
DROP POLICY IF EXISTS "Authenticated users can create org" ON public.organizations;

CREATE POLICY "Authenticated users can create org"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Also fix SELECT and UPDATE to be permissive
DROP POLICY IF EXISTS "View organizations" ON public.organizations;

CREATE POLICY "View organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (is_org_member(auth.uid(), id) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Update organizations" ON public.organizations;

CREATE POLICY "Update organizations"
ON public.organizations
FOR UPDATE
TO authenticated
USING (has_org_role(auth.uid(), id, 'owner'::app_role) OR has_org_role(auth.uid(), id, 'admin'::app_role) OR is_super_admin(auth.uid()));
