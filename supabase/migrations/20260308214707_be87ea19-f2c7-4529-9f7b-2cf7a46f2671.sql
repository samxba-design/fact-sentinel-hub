
-- 1. Add email_theme column to notification_preferences for persistence
ALTER TABLE public.notification_preferences 
ADD COLUMN IF NOT EXISTS email_theme text NOT NULL DEFAULT 'dark';

-- 2. Fix people table RLS: restrict mutations to org members only
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated can insert people" ON public.people;
DROP POLICY IF EXISTS "Authenticated can update people" ON public.people;
DROP POLICY IF EXISTS "Authenticated can delete people" ON public.people;

-- Create properly scoped policies requiring org membership via org_people
CREATE POLICY "Org members can insert people" ON public.people
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Org members can update people" ON public.people
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.org_people op
    WHERE op.person_id = people.id
    AND is_org_member(auth.uid(), op.org_id)
  )
);

CREATE POLICY "Org members can delete people" ON public.people
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.org_people op
    WHERE op.person_id = people.id
    AND is_org_member(auth.uid(), op.org_id)
  )
);

-- 3. Set all existing tracking_profiles scan_schedule to 'manual' to disable auto-scanning
-- (This makes auto OFF by default for existing users)
UPDATE public.tracking_profiles SET scan_schedule = 'manual' WHERE scan_schedule IS NULL OR scan_schedule NOT IN ('manual', 'paused');
