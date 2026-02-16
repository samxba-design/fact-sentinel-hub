-- Allow org members to delete mentions (needed for scan deletion)
CREATE POLICY "Delete mentions"
ON public.mentions
FOR DELETE
USING (is_org_member(auth.uid(), org_id));

-- Allow org members to delete scan runs
CREATE POLICY "Delete scan runs"
ON public.scan_runs
FOR DELETE
USING (is_org_member(auth.uid(), org_id));