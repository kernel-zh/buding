-- Buding's generated tracker data.  The JSON payloads intentionally retain the
-- existing validated TypeScript shape, so a schema change does not require a
-- second mapping layer in the synchronizer.
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

alter table public.buding_patchsets enable row level security;
alter table public.buding_lore_messages enable row level security;
alter table public.buding_git_commits enable row level security;
alter table public.buding_state enable row level security;

-- The browser never writes tracker data.  The scheduled workflow uses a
-- server-only secret key, which bypasses these policies.
create policy "public read patchsets" on public.buding_patchsets for select using (true);
create policy "public read lore messages" on public.buding_lore_messages for select using (true);
create policy "public read git commits" on public.buding_git_commits for select using (true);
create policy "public read state" on public.buding_state for select using (true);
