
-- Notification preferences per user per org
CREATE TABLE public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Email notification toggles
  critical_alerts boolean NOT NULL DEFAULT true,
  mention_spikes boolean NOT NULL DEFAULT true,
  negative_spikes boolean NOT NULL DEFAULT true,
  viral_risk boolean NOT NULL DEFAULT true,
  escalation_assigned boolean NOT NULL DEFAULT true,
  escalation_updated boolean NOT NULL DEFAULT true,
  weekly_digest boolean NOT NULL DEFAULT true,
  new_scan_complete boolean NOT NULL DEFAULT false,
  
  -- Delivery preferences
  email_enabled boolean NOT NULL DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, org_id)
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences"
  ON public.notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- Service role needs to read preferences for sending notifications
CREATE POLICY "Service can read all preferences"
  ON public.notification_preferences FOR SELECT
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Email log for tracking sent emails
CREATE TABLE public.email_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  email_type text NOT NULL,
  subject text NOT NULL,
  resend_id text,
  status text NOT NULL DEFAULT 'sent',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view email logs"
  ON public.email_logs FOR SELECT
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Service can insert email logs"
  ON public.email_logs FOR INSERT
  WITH CHECK (true);
