
-- Internal contacts directory (people who may not have app accounts)
CREATE TABLE public.internal_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  email text,
  department text,
  role_title text,
  phone text,
  notes text,
  is_department_lead boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.internal_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View contacts" ON public.internal_contacts FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Manage contacts" ON public.internal_contacts FOR INSERT WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "Update contacts" ON public.internal_contacts FOR UPDATE USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Delete contacts" ON public.internal_contacts FOR DELETE USING (is_org_member(auth.uid(), org_id));

CREATE TRIGGER update_internal_contacts_updated_at
  BEFORE UPDATE ON public.internal_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
