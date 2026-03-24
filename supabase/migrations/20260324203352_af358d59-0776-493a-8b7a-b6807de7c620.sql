
DROP POLICY IF EXISTS "View mention_narratives" ON mention_narratives;
DROP POLICY IF EXISTS "Manage mention_narratives" ON mention_narratives;
DROP POLICY IF EXISTS "Delete mention_narratives" ON mention_narratives;

CREATE POLICY "View mention_narratives" ON mention_narratives FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM mentions
    WHERE mentions.id = mention_narratives.mention_id
      AND is_org_member(auth.uid(), mentions.org_id)
  ));

CREATE POLICY "Manage mention_narratives" ON mention_narratives FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM mentions
    WHERE mentions.id = mention_narratives.mention_id
      AND is_org_member(auth.uid(), mentions.org_id)
  ));

CREATE POLICY "Delete mention_narratives" ON mention_narratives FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM mentions
    WHERE mentions.id = mention_narratives.mention_id
      AND is_org_member(auth.uid(), mentions.org_id)
  ));
