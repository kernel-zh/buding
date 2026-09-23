-- Buding complete schema for a brand-new Supabase project.
-- Execute this file once in the Supabase SQL Editor on an empty project.
-- Existing installations must apply the timestamped files in migrations/
-- instead, in ascending filename order.

create table if not exists public.buding_patchsets (
  id text primary key,
  summary jsonb not null,
  detail jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.buding_lore_messages (
  message_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.buding_git_commits (
  tree text not null check (tree in ('alex', 'corbet', 'linus')),
  commit text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tree, commit)
);

create table if not exists public.buding_state (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.buding_api_keys (
  key_id text primary key,
  verifier text not null,
  label text not null check (char_length(label) between 1 and 120),
  role text not null check (role in ('admin', 'operator')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);

create table if not exists public.buding_patchset_status_overrides (
  patchset_id text primary key,
  status text not null check (status in ('proposed', 'needs-revision', 'superseded', 'approved', 'rejected', 'applied')),
  reason text check (char_length(reason) <= 1000),
  actor_key_id text not null,
  actor_label text not null,
  set_at timestamptz not null default now()
);

create table if not exists public.buding_patchset_status_events (
  id uuid primary key,
  patchset_id text not null,
  status text not null check (status in ('proposed', 'needs-revision', 'superseded', 'approved', 'rejected', 'applied')),
  reason text,
  actor_key_id text not null,
  actor_label text not null,
  source text not null check (source = 'manual'),
  created_at timestamptz not null default now()
);

alter table public.buding_patchsets enable row level security;
alter table public.buding_lore_messages enable row level security;
alter table public.buding_git_commits enable row level security;
alter table public.buding_state enable row level security;
alter table public.buding_api_keys enable row level security;
alter table public.buding_patchset_status_overrides enable row level security;
alter table public.buding_patchset_status_events enable row level security;

-- The public website only reads generated tracker data and the resulting
-- manual status override. Secret-key server requests bypass RLS for writes.
create policy "public read patchsets" on public.buding_patchsets for select using (true);
create policy "public read lore messages" on public.buding_lore_messages for select using (true);
create policy "public read git commits" on public.buding_git_commits for select using (true);
create policy "public read state" on public.buding_state for select using (true);
create policy "public read patchset status overrides"
  on public.buding_patchset_status_overrides for select using (true);
