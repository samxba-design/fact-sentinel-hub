
-- Fix ignored_sources RLS: argument order is swapped (org_id, auth.uid() should be auth.uid(), org_id)
DROP POLICY IF EXISTS "Org members can delete ignored sources" ON public.ignored_sources;
DROP POLICY IF EXISTS "Org members can manage ignored sources" ON public.ignored_sources;
DROP POLICY IF EXISTS "Org members can view ignored sources" ON public.ignored_sources;

CREATE POLICY "Org members can view ignored sources" ON public.ignored_sources FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can manage ignored sources" ON public.ignored_sources FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can delete ignored sources" ON public.ignored_sources FOR DELETE TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can update ignored sources" ON public.ignored_sources FOR UPDATE TO authenticated USING (is_org_member(auth.uid(), org_id));

-- Add missing DELETE policies
CREATE POLICY "Delete alerts" ON public.alerts FOR DELETE TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Delete incidents" ON public.incidents FOR DELETE TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Delete exports" ON public.exports FOR DELETE TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Delete response drafts" ON public.response_drafts FOR DELETE TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Delete scan templates" ON public.scan_templates FOR DELETE TO authenticated USING (is_org_member(auth.uid(), org_id));
