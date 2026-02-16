
-- is_super_admin function (cast to text to avoid enum commit issue)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'super_admin'
  )
$$;

-- Allow super-admins to view ALL profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view profiles"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR is_super_admin(auth.uid()));

-- Allow super-admins to view ALL organizations
DROP POLICY IF EXISTS "Org members can view org" ON public.organizations;
CREATE POLICY "View organizations"
  ON public.organizations FOR SELECT
  USING (is_org_member(auth.uid(), id) OR is_super_admin(auth.uid()));

-- Allow super-admins to update ANY organization
DROP POLICY IF EXISTS "Org admins can update" ON public.organizations;
CREATE POLICY "Update organizations"
  ON public.organizations FOR UPDATE
  USING (has_org_role(auth.uid(), id, 'owner'::app_role) OR has_org_role(auth.uid(), id, 'admin'::app_role) OR is_super_admin(auth.uid()));

-- Allow super-admins to view ALL memberships
DROP POLICY IF EXISTS "Users can view own memberships" ON public.org_memberships;
CREATE POLICY "View memberships"
  ON public.org_memberships FOR SELECT
  USING (user_id = auth.uid() OR is_org_member(auth.uid(), org_id) OR is_super_admin(auth.uid()));

-- Allow super-admins to view ALL audit logs
DROP POLICY IF EXISTS "Members can view audit logs" ON public.audit_logs;
CREATE POLICY "View audit logs"
  ON public.audit_logs FOR SELECT
  USING (is_org_member(auth.uid(), org_id) OR is_super_admin(auth.uid()));

-- Allow super-admins to view ALL user_roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "View user roles"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid() OR is_super_admin(auth.uid()));

-- Allow super-admins to manage user_roles
CREATE POLICY "Super admins can manage roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (is_super_admin(auth.uid()));
