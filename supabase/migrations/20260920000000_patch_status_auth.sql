-- Authenticated manual status overrides are deliberately separate from the
-- generated JSON. The synchronizer may safely replace its snapshots without
-- erasing a maintainer decision.
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
  reason text not null check (char_length(reason) between 1 and 1000),
  actor_key_id text not null,
  actor_label text not null,
  set_at timestamptz not null default now()
);

create table if not exists public.buding_patchset_status_events (
  id uuid primary key,
  patchset_id text not null,
  status text not null check (status in ('proposed', 'needs-revision', 'superseded', 'approved', 'rejected', 'applied')),
  reason text not null,
  actor_key_id text not null,
  actor_label text not null,
  source text not null check (source = 'manual'),
  created_at timestamptz not null default now()
);

alter table public.buding_api_keys enable row level security;
alter table public.buding_patchset_status_overrides enable row level security;
alter table public.buding_patchset_status_events enable row level security;

-- Public pages need the final status and its reason, but never API key data or
-- audit history. All writes are performed by a server-only Supabase key.
create policy "public read patchset status overrides"
  on public.buding_patchset_status_overrides for select using (true);
