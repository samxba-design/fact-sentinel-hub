-- Topic Watches: lightweight saved search + analytics objects
create table if not exists public.topic_watches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  workspace_id uuid,
  name text not null,
  query text not null,
  description text,
  status text default 'active' check (status in ('active', 'paused', 'archived')),
  alert_threshold integer default 20,
  color text default '#f97316',
  tags text[] default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Hourly snapshots for trend lines
create table if not exists public.topic_watch_snapshots (
  id uuid primary key default gen_random_uuid(),
  topic_watch_id uuid references public.topic_watches(id) on delete cascade,
  bucket_hour timestamptz not null,
  total_mentions integer default 0,
  negative_mentions integer default 0,
  positive_mentions integer default 0,
  neutral_mentions integer default 0,
  binance_overlap integer default 0,
  binance_overlap_pct numeric(5,2) default 0,
  velocity numeric(8,2) default 0,
  top_sources text[] default '{}',
  created_at timestamptz default now()
);

-- Amplifier / author metadata
create table if not exists public.mention_authors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  platform text not null,
  platform_user_id text,
  handle text,
  display_name text,
  follower_count integer default 0,
  account_type text default 'unknown' check (account_type in ('journalist','influencer','regulator','competitor','anonymous','unknown')),
  verified boolean default false,
  bio_snippet text,
  first_seen_at timestamptz default now(),
  last_active_at timestamptz default now(),
  total_negative_mentions integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(org_id, platform, handle)
);

-- Response events for efficacy tracking
create table if not exists public.response_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  incident_id uuid,
  topic_watch_id uuid references public.topic_watches(id) on delete set null,
  response_type text not null check (response_type in ('statement','tweet','press_release','blog_post','spokesperson','other')),
  title text not null,
  content_url text,
  content_preview text,
  published_at timestamptz not null,
  sentiment_before numeric(5,3),
  volume_before integer,
  sentiment_after numeric(5,3),
  volume_after integer,
  sentiment_delta numeric(5,3),
  efficacy_score integer,
  efficacy_label text default 'pending',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Author columns on mentions (safe add if not exists)
alter table public.mentions add column if not exists author_handle text;
alter table public.mentions add column if not exists author_follower_count integer default 0;
alter table public.mentions add column if not exists author_account_type text default 'unknown';

alter table public.topic_watches enable row level security;
alter table public.topic_watch_snapshots enable row level security;
alter table public.mention_authors enable row level security;
alter table public.response_events enable row level security;

create policy if not exists "org members manage topic watches"
  on public.topic_watches for all
  using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

create policy if not exists "org members read snapshots"
  on public.topic_watch_snapshots for all
  using (topic_watch_id in (
    select id from public.topic_watches
    where org_id in (select org_id from public.org_members where user_id = auth.uid())
  ));

create policy if not exists "org members manage authors"
  on public.mention_authors for all
  using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

create policy if not exists "org members manage responses"
  on public.response_events for all
  using (org_id in (select org_id from public.org_members where user_id = auth.uid()));

create index if not exists topic_watches_org_idx on public.topic_watches(org_id);
create index if not exists topic_snapshots_idx on public.topic_watch_snapshots(topic_watch_id, bucket_hour desc);
create index if not exists mention_authors_org_idx on public.mention_authors(org_id, platform);
create index if not exists response_events_org_idx on public.response_events(org_id);
