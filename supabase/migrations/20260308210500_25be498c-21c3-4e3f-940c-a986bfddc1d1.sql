
-- Tighten junction table RLS: replace USING(true) with org membership checks via parent tables

-- incident_narratives: check via incidents parent
DROP POLICY IF EXISTS "View incident_narratives" ON public.incident_narratives;
CREATE POLICY "View incident_narratives" ON public.incident_narratives FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.incidents WHERE incidents.id = incident_narratives.incident_id AND is_org_member(auth.uid(), incidents.org_id)));

DROP POLICY IF EXISTS "Manage incident_narratives" ON public.incident_narratives;
CREATE POLICY "Manage incident_narratives" ON public.incident_narratives FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.incidents WHERE incidents.id = incident_narratives.incident_id AND is_org_member(auth.uid(), incidents.org_id)));

DROP POLICY IF EXISTS "Delete incident_narratives" ON public.incident_narratives;
CREATE POLICY "Delete incident_narratives" ON public.incident_narratives FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.incidents WHERE incidents.id = incident_narratives.incident_id AND is_org_member(auth.uid(), incidents.org_id)));

-- incident_mentions: check via incidents parent
DROP POLICY IF EXISTS "View incident_mentions" ON public.incident_mentions;
CREATE POLICY "View incident_mentions" ON public.incident_mentions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.incidents WHERE incidents.id = incident_mentions.incident_id AND is_org_member(auth.uid(), incidents.org_id)));

DROP POLICY IF EXISTS "Manage incident_mentions" ON public.incident_mentions;
CREATE POLICY "Manage incident_mentions" ON public.incident_mentions FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.incidents WHERE incidents.id = incident_mentions.incident_id AND is_org_member(auth.uid(), incidents.org_id)));

DROP POLICY IF EXISTS "Delete incident_mentions" ON public.incident_mentions;
CREATE POLICY "Delete incident_mentions" ON public.incident_mentions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.incidents WHERE incidents.id = incident_mentions.incident_id AND is_org_member(auth.uid(), incidents.org_id)));

-- mention_people: check via mentions parent
DROP POLICY IF EXISTS "View mention_people" ON public.mention_people;
CREATE POLICY "View mention_people" ON public.mention_people FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.mentions WHERE mentions.id = mention_people.mention_id AND is_org_member(auth.uid(), mentions.org_id)));

DROP POLICY IF EXISTS "Manage mention_people" ON public.mention_people;
CREATE POLICY "Manage mention_people" ON public.mention_people FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.mentions WHERE mentions.id = mention_people.mention_id AND is_org_member(auth.uid(), mentions.org_id)));

DROP POLICY IF EXISTS "Delete mention_people" ON public.mention_people;
CREATE POLICY "Delete mention_people" ON public.mention_people FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.mentions WHERE mentions.id = mention_people.mention_id AND is_org_member(auth.uid(), mentions.org_id)));

-- mention_topics: check via mentions parent
DROP POLICY IF EXISTS "View mention_topics" ON public.mention_topics;
CREATE POLICY "View mention_topics" ON public.mention_topics FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.mentions WHERE mentions.id = mention_topics.mention_id AND is_org_member(auth.uid(), mentions.org_id)));

DROP POLICY IF EXISTS "Manage mention_topics" ON public.mention_topics;
CREATE POLICY "Manage mention_topics" ON public.mention_topics FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.mentions WHERE mentions.id = mention_topics.mention_id AND is_org_member(auth.uid(), mentions.org_id)));

DROP POLICY IF EXISTS "Delete mention_topics" ON public.mention_topics;
CREATE POLICY "Delete mention_topics" ON public.mention_topics FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.mentions WHERE mentions.id = mention_topics.mention_id AND is_org_member(auth.uid(), mentions.org_id)));

-- incident_events: check via incidents parent
DROP POLICY IF EXISTS "View incident_events" ON public.incident_events;
CREATE POLICY "View incident_events" ON public.incident_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.incidents WHERE incidents.id = incident_events.incident_id AND is_org_member(auth.uid(), incidents.org_id)));

DROP POLICY IF EXISTS "Manage incident_events" ON public.incident_events;
CREATE POLICY "Manage incident_events" ON public.incident_events FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.incidents WHERE incidents.id = incident_events.incident_id AND is_org_member(auth.uid(), incidents.org_id)));

-- escalation_comments: check via escalations parent
DROP POLICY IF EXISTS "View esc comments" ON public.escalation_comments;
CREATE POLICY "View esc comments" ON public.escalation_comments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.escalations WHERE escalations.id = escalation_comments.escalation_id AND is_org_member(auth.uid(), escalations.org_id)));

DROP POLICY IF EXISTS "Manage esc comments" ON public.escalation_comments;
CREATE POLICY "Manage esc comments" ON public.escalation_comments FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.escalations WHERE escalations.id = escalation_comments.escalation_id AND is_org_member(auth.uid(), escalations.org_id)));

-- claim_extractions: check via mentions parent (when mention_id is set)
DROP POLICY IF EXISTS "View claims" ON public.claim_extractions;
CREATE POLICY "View claims" ON public.claim_extractions FOR SELECT TO authenticated
USING (mention_id IS NULL OR EXISTS (SELECT 1 FROM public.mentions WHERE mentions.id = claim_extractions.mention_id AND is_org_member(auth.uid(), mentions.org_id)));

DROP POLICY IF EXISTS "Manage claims" ON public.claim_extractions;
CREATE POLICY "Manage claims" ON public.claim_extractions FOR INSERT TO authenticated
WITH CHECK (mention_id IS NULL OR EXISTS (SELECT 1 FROM public.mentions WHERE mentions.id = claim_extractions.mention_id AND is_org_member(auth.uid(), mentions.org_id)));
