-- Add subscription columns to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_type text,
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_approved_by uuid,
  ADD COLUMN IF NOT EXISTS subscription_approved_at timestamptz;

-- Create subscription_requests table for the approval workflow
CREATE TABLE public.subscription_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  requested_type text NOT NULL DEFAULT 'monthly',
  message text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

-- Org members can create requests for their org
CREATE POLICY "Members can request subscriptions"
  ON public.subscription_requests FOR INSERT
  WITH CHECK (is_org_member(auth.uid(), org_id));

-- Org members can view their org's requests
CREATE POLICY "Members can view own org requests"
  ON public.subscription_requests FOR SELECT
  USING (is_org_member(auth.uid(), org_id) OR is_super_admin(auth.uid()));

-- Only super admins can update (approve/reject)
CREATE POLICY "Super admins can review requests"
  ON public.subscription_requests FOR UPDATE
  USING (is_super_admin(auth.uid()));