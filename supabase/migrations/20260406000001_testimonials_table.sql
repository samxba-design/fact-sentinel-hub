-- Create testimonials table for external testimonial submissions
-- Keeps submissions separate from brand mentions to avoid sentiment data pollution

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  submitter_name text not null,
  submitter_email text,
  submitter_company text,
  submitter_role text,
  content text not null,
  rating integer check (rating between 1 and 5),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'featured')),
  source_slug text,           -- which testimonial request link was used
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  notes text,                 -- internal reviewer notes
  featured_order integer,     -- for ordering featured testimonials on public pages
  metadata jsonb default '{}'::jsonb
);

create index if not exists testimonials_org_id_idx on public.testimonials(org_id);
create index if not exists testimonials_status_idx on public.testimonials(org_id, status);
create index if not exists testimonials_slug_idx on public.testimonials(source_slug);

-- RLS: org members can read/manage; submissions are anonymous (no auth required for insert)
alter table public.testimonials enable row level security;

-- Org members can view their testimonials
create policy "org_members_view_testimonials" on public.testimonials
  for select using (
    exists (
      select 1 from public.org_memberships
      where org_memberships.org_id = testimonials.org_id
        and org_memberships.user_id = auth.uid()
    )
    or exists (
      select 1 from public.organizations
      where organizations.id = testimonials.org_id
        and organizations.id in (
          select org_id from public.org_memberships where user_id = auth.uid()
        )
    )
  );

-- Org admins/owners can update (approve/reject)
create policy "org_admins_manage_testimonials" on public.testimonials
  for all using (
    exists (
      select 1 from public.org_memberships
      where org_memberships.org_id = testimonials.org_id
        and org_memberships.user_id = auth.uid()
        and org_memberships.role in ('owner', 'admin', 'approver')
    )
  );

-- Public insert: anyone can submit a testimonial (no auth required)
-- The org_id must be valid (references organizations)
create policy "public_submit_testimonial" on public.testimonials
  for insert with check (
    exists (select 1 from public.organizations where id = testimonials.org_id)
  );
