-- Automatic status derivation remains the default in application code, while
-- authenticated maintainers may override it with any supported status.
alter table public.buding_patchset_status_overrides
  drop constraint if exists buding_patchset_status_overrides_status_check;

alter table public.buding_patchset_status_overrides
  add constraint buding_patchset_status_overrides_status_check
  check (status in ('proposed', 'needs-revision', 'superseded', 'approved', 'rejected', 'applied'));

alter table public.buding_patchset_status_events
  drop constraint if exists buding_patchset_status_events_status_check;

alter table public.buding_patchset_status_events
  add constraint buding_patchset_status_events_status_check
  check (status in ('proposed', 'needs-revision', 'superseded', 'approved', 'rejected', 'applied'));
