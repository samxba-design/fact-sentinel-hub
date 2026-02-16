
-- RBAC role enum
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'analyst', 'approver', 'viewer');

-- Organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  domain TEXT,
  industry TEXT,
  regions TEXT[] DEFAULT '{}',
  languages TEXT[] DEFAULT '{en}',
  plan TEXT DEFAULT 'free',
  scan_quota INTEGER DEFAULT 100,
  incident_mode BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Org memberships with roles
CREATE TABLE public.org_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'viewer',
  invited_email TEXT,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- User roles table (for RBAC security definer function)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tracking profiles
CREATE TABLE public.tracking_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  settings JSONB DEFAULT '{}',
  scan_schedule TEXT DEFAULT '0 9 * * *',
  alert_emails TEXT[] DEFAULT '{}',
  escalation_emails TEXT[] DEFAULT '{}',
  quiet_hours_start INTEGER,
  quiet_hours_end INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Keywords
CREATE TABLE public.keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- brand, product, people, risk_trigger, competitor
  value TEXT NOT NULL,
  locked BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Topics
CREATE TABLE public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Narratives
CREATE TABLE public.narratives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  example_phrases TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active', -- active, watch, ignored
  confidence NUMERIC(3,2),
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- People (global)
CREATE TABLE public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  titles TEXT[] DEFAULT '{}',
  handles JSONB DEFAULT '{}',
  links TEXT[] DEFAULT '{}',
  follower_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Org-people join
CREATE TABLE public.org_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  tier TEXT DEFAULT 'other', -- executive, spokesperson, security, compliance, product, other
  status TEXT DEFAULT 'suggested',
  confidence NUMERIC(3,2),
  evidence TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, person_id)
);

-- Sources
CREATE TABLE public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scan templates
CREATE TABLE public.scan_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scan runs
CREATE TABLE public.scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  config_snapshot JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending', -- pending, running, completed, failed
  total_mentions INTEGER DEFAULT 0,
  negative_pct NUMERIC(5,2) DEFAULT 0,
  emergencies_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Mentions
CREATE TABLE public.mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scan_run_id UUID REFERENCES public.scan_runs(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  url TEXT,
  posted_at TIMESTAMPTZ,
  author_name TEXT,
  author_handle TEXT,
  author_verified BOOLEAN DEFAULT FALSE,
  author_follower_count INTEGER DEFAULT 0,
  content TEXT,
  language TEXT DEFAULT 'en',
  metrics JSONB DEFAULT '{}',
  sentiment_score NUMERIC(4,3),
  sentiment_label TEXT,
  sentiment_confidence NUMERIC(3,2),
  severity TEXT DEFAULT 'low', -- low, medium, high, critical
  flags JSONB DEFAULT '{}',
  status TEXT DEFAULT 'new',
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Junction tables
CREATE TABLE public.mention_topics (
  mention_id UUID NOT NULL REFERENCES public.mentions(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  PRIMARY KEY (mention_id, topic_id)
);

CREATE TABLE public.mention_narratives (
  mention_id UUID NOT NULL REFERENCES public.mentions(id) ON DELETE CASCADE,
  narrative_id UUID NOT NULL REFERENCES public.narratives(id) ON DELETE CASCADE,
  PRIMARY KEY (mention_id, narrative_id)
);

CREATE TABLE public.mention_people (
  mention_id UUID NOT NULL REFERENCES public.mentions(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  relation_type TEXT DEFAULT 'about', -- authored, about
  PRIMARY KEY (mention_id, person_id)
);

-- Claim extractions
CREATE TABLE public.claim_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mention_id UUID REFERENCES public.mentions(id) ON DELETE CASCADE,
  pasted_input_id UUID,
  claim_text TEXT NOT NULL,
  category TEXT,
  confidence NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Approved facts
CREATE TABLE public.approved_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  jurisdiction TEXT,
  statement_text TEXT NOT NULL,
  source_link TEXT,
  status TEXT DEFAULT 'under_review', -- active, under_review, deprecated
  version INTEGER DEFAULT 1,
  last_reviewed TIMESTAMPTZ DEFAULT now(),
  owner_department TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Approved templates
CREATE TABLE public.approved_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scenario_type TEXT,
  tone TEXT DEFAULT 'professional',
  platform_length TEXT DEFAULT 'general', -- short, general, long
  template_text TEXT NOT NULL,
  required_fact_categories TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft', -- draft, active, deprecated
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Response drafts
CREATE TABLE public.response_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type TEXT DEFAULT 'paste', -- mention, paste
  source_mention_id UUID REFERENCES public.mentions(id) ON DELETE SET NULL,
  input_text TEXT NOT NULL,
  output_text TEXT,
  status TEXT DEFAULT 'draft', -- draft, blocked, approved
  facts_used JSONB DEFAULT '[]',
  links_used JSONB DEFAULT '[]',
  claims_extracted JSONB DEFAULT '[]',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Escalations
CREATE TABLE public.escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  department TEXT,
  priority TEXT DEFAULT 'medium', -- low, medium, high, critical
  status TEXT DEFAULT 'open', -- open, in_progress, resolved
  description TEXT,
  related_mention_ids UUID[] DEFAULT '{}',
  related_narrative_ids UUID[] DEFAULT '{}',
  pasted_text TEXT,
  requester_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Exports
CREATE TABLE public.exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- scan_run, selection, incident
  sheet_id TEXT,
  last_exported_at TIMESTAMPTZ,
  mapping JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Alerts
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- emergency, spike, cross_platform, influencer, scam
  triggered_at TIMESTAMPTZ DEFAULT now(),
  payload JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active', -- active, acknowledged, resolved
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Incidents
CREATE TABLE public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  stakeholders UUID[] DEFAULT '{}',
  status TEXT DEFAULT 'active', -- active, resolved, post_mortem
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Incident mentions join
CREATE TABLE public.incident_mentions (
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  mention_id UUID NOT NULL REFERENCES public.mentions(id) ON DELETE CASCADE,
  PRIMARY KEY (incident_id, mention_id)
);

-- Incident narratives join
CREATE TABLE public.incident_narratives (
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  narrative_id UUID NOT NULL REFERENCES public.narratives(id) ON DELETE CASCADE,
  PRIMARY KEY (incident_id, narrative_id)
);

-- Incident timeline events
CREATE TABLE public.incident_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Escalation comments
CREATE TABLE public.escalation_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id UUID NOT NULL REFERENCES public.escalations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============ RLS ============

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mention_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mention_narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mention_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approved_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approved_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.response_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_comments ENABLE ROW LEVEL SECURITY;

-- Helper: check org membership
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE user_id = _user_id AND org_id = _org_id AND accepted_at IS NOT NULL
  )
$$;

-- Helper: check org role
CREATE OR REPLACE FUNCTION public.has_org_role(_user_id UUID, _org_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE user_id = _user_id AND org_id = _org_id AND role = _role AND accepted_at IS NOT NULL
  )
$$;

-- Helper: has_role for user_roles table
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles: users can read/update own
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Organizations: members can view
CREATE POLICY "Org members can view org" ON public.organizations FOR SELECT
  USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "Authenticated users can create org" ON public.organizations FOR INSERT
  TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Org admins can update" ON public.organizations FOR UPDATE
  USING (public.has_org_role(auth.uid(), id, 'owner') OR public.has_org_role(auth.uid(), id, 'admin'));

-- Org memberships: members can view theirs
CREATE POLICY "Users can view own memberships" ON public.org_memberships FOR SELECT
  USING (user_id = auth.uid() OR public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage memberships" ON public.org_memberships FOR INSERT
  TO authenticated WITH CHECK (
    public.has_org_role(auth.uid(), org_id, 'owner') OR public.has_org_role(auth.uid(), org_id, 'admin')
    OR user_id = auth.uid()
  );
CREATE POLICY "Admins can update memberships" ON public.org_memberships FOR UPDATE
  USING (public.has_org_role(auth.uid(), org_id, 'owner') OR public.has_org_role(auth.uid(), org_id, 'admin'));
CREATE POLICY "Admins can delete memberships" ON public.org_memberships FOR DELETE
  USING (public.has_org_role(auth.uid(), org_id, 'owner') OR public.has_org_role(auth.uid(), org_id, 'admin') OR user_id = auth.uid());

-- user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());

-- Generic org-scoped policies (macro pattern)
-- For all org-scoped tables: members can SELECT, admins+ can INSERT/UPDATE/DELETE

-- Audit logs (read-only for members, insert from backend)
CREATE POLICY "Members can view audit logs" ON public.audit_logs FOR SELECT
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Authenticated can insert audit" ON public.audit_logs FOR INSERT
  TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));

-- Tracking profiles
CREATE POLICY "Members can view tracking" ON public.tracking_profiles FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can manage tracking" ON public.tracking_profiles FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins can update tracking" ON public.tracking_profiles FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));

-- Keywords
CREATE POLICY "Members can view keywords" ON public.keywords FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Members can manage keywords" ON public.keywords FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Members can update keywords" ON public.keywords FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Members can delete keywords" ON public.keywords FOR DELETE USING (public.is_org_member(auth.uid(), org_id));

-- Topics
CREATE POLICY "View topics" ON public.topics FOR SELECT USING (org_id IS NULL OR public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage topics" ON public.topics FOR INSERT TO authenticated WITH CHECK (org_id IS NULL OR public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update topics" ON public.topics FOR UPDATE USING (org_id IS NULL OR public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Delete topics" ON public.topics FOR DELETE USING (org_id IS NULL OR public.is_org_member(auth.uid(), org_id));

-- Narratives
CREATE POLICY "View narratives" ON public.narratives FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage narratives" ON public.narratives FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update narratives" ON public.narratives FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Delete narratives" ON public.narratives FOR DELETE USING (public.is_org_member(auth.uid(), org_id));

-- People (global read)
CREATE POLICY "Anyone can view people" ON public.people FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated can insert people" ON public.people FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Authenticated can update people" ON public.people FOR UPDATE TO authenticated USING (TRUE);

-- Org people
CREATE POLICY "View org people" ON public.org_people FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage org people" ON public.org_people FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update org people" ON public.org_people FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Delete org people" ON public.org_people FOR DELETE USING (public.is_org_member(auth.uid(), org_id));

-- Sources
CREATE POLICY "View sources" ON public.sources FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage sources" ON public.sources FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update sources" ON public.sources FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Delete sources" ON public.sources FOR DELETE USING (public.is_org_member(auth.uid(), org_id));

-- Scan templates
CREATE POLICY "View scan templates" ON public.scan_templates FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage scan templates" ON public.scan_templates FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update scan templates" ON public.scan_templates FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));

-- Scan runs
CREATE POLICY "View scan runs" ON public.scan_runs FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage scan runs" ON public.scan_runs FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update scan runs" ON public.scan_runs FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));

-- Mentions
CREATE POLICY "View mentions" ON public.mentions FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage mentions" ON public.mentions FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update mentions" ON public.mentions FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));

-- Junction tables (follow parent mention access)
CREATE POLICY "View mention_topics" ON public.mention_topics FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Manage mention_topics" ON public.mention_topics FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Delete mention_topics" ON public.mention_topics FOR DELETE TO authenticated USING (TRUE);

CREATE POLICY "View mention_narratives" ON public.mention_narratives FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Manage mention_narratives" ON public.mention_narratives FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Delete mention_narratives" ON public.mention_narratives FOR DELETE TO authenticated USING (TRUE);

CREATE POLICY "View mention_people" ON public.mention_people FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Manage mention_people" ON public.mention_people FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Delete mention_people" ON public.mention_people FOR DELETE TO authenticated USING (TRUE);

-- Claim extractions
CREATE POLICY "View claims" ON public.claim_extractions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Manage claims" ON public.claim_extractions FOR INSERT TO authenticated WITH CHECK (TRUE);

-- Approved facts
CREATE POLICY "View facts" ON public.approved_facts FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage facts" ON public.approved_facts FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update facts" ON public.approved_facts FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Delete facts" ON public.approved_facts FOR DELETE USING (public.is_org_member(auth.uid(), org_id));

-- Approved templates
CREATE POLICY "View templates" ON public.approved_templates FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage templates" ON public.approved_templates FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update templates" ON public.approved_templates FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Delete templates" ON public.approved_templates FOR DELETE USING (public.is_org_member(auth.uid(), org_id));

-- Response drafts
CREATE POLICY "View drafts" ON public.response_drafts FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage drafts" ON public.response_drafts FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update drafts" ON public.response_drafts FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));

-- Escalations
CREATE POLICY "View escalations" ON public.escalations FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage escalations" ON public.escalations FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update escalations" ON public.escalations FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));

-- Escalation comments
CREATE POLICY "View esc comments" ON public.escalation_comments FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Manage esc comments" ON public.escalation_comments FOR INSERT TO authenticated WITH CHECK (TRUE);

-- Exports
CREATE POLICY "View exports" ON public.exports FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage exports" ON public.exports FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update exports" ON public.exports FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));

-- Alerts
CREATE POLICY "View alerts" ON public.alerts FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage alerts" ON public.alerts FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update alerts" ON public.alerts FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));

-- Incidents
CREATE POLICY "View incidents" ON public.incidents FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage incidents" ON public.incidents FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Update incidents" ON public.incidents FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "View incident_mentions" ON public.incident_mentions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Manage incident_mentions" ON public.incident_mentions FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Delete incident_mentions" ON public.incident_mentions FOR DELETE TO authenticated USING (TRUE);

CREATE POLICY "View incident_narratives" ON public.incident_narratives FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Manage incident_narratives" ON public.incident_narratives FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Delete incident_narratives" ON public.incident_narratives FOR DELETE TO authenticated USING (TRUE);

CREATE POLICY "View incident_events" ON public.incident_events FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Manage incident_events" ON public.incident_events FOR INSERT TO authenticated WITH CHECK (TRUE);

-- Trigger for auto-creating profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tracking_profiles_updated_at BEFORE UPDATE ON public.tracking_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_narratives_updated_at BEFORE UPDATE ON public.narratives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_people_updated_at BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_approved_facts_updated_at BEFORE UPDATE ON public.approved_facts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_approved_templates_updated_at BEFORE UPDATE ON public.approved_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_escalations_updated_at BEFORE UPDATE ON public.escalations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default topics
INSERT INTO public.topics (name, description, is_default) VALUES
  ('Security', 'Cybersecurity, data breaches, vulnerabilities', TRUE),
  ('Compliance', 'Regulatory compliance, audits, certifications', TRUE),
  ('Product/Outage', 'Product issues, service outages, downtime', TRUE),
  ('Support', 'Customer support quality, response times', TRUE),
  ('Leadership', 'Executive leadership, management changes', TRUE),
  ('Scams/Impersonation', 'Fraud, scam attempts, brand impersonation', TRUE),
  ('Fees/Pricing', 'Pricing changes, fee structures, billing', TRUE),
  ('Withdrawals', 'Withdrawal issues, delays, restrictions', TRUE),
  ('Listing/Delisting', 'Asset listings, delistings, market availability', TRUE),
  ('Partnerships', 'Business partnerships, collaborations, integrations', TRUE),
  ('Regulatory', 'Government regulation, legal actions, policy changes', TRUE);
