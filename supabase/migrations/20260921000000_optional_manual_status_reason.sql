-- A manual status can be a terse maintainer decision without an explanation.
-- Keep historical reasons intact, while allowing NULL for newly saved overrides
-- and audit events.
alter table public.buding_patchset_status_overrides
  drop constraint if exists buding_patchset_status_overrides_reason_check;

alter table public.buding_patchset_status_overrides
  alter column reason drop not null;

alter table public.buding_patchset_status_overrides
  add constraint buding_patchset_status_overrides_reason_check
  check (char_length(reason) <= 1000);

alter table public.buding_patchset_status_events
  alter column reason drop not null;
