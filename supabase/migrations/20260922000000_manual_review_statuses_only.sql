-- Proposed, Superseded, and Applied are derived from synchronized evidence.
-- Only review decisions may remain as authenticated manual overrides.
delete from public.buding_patchset_status_overrides
where status not in ('needs-revision', 'approved', 'rejected');

alter table public.buding_patchset_status_overrides
  drop constraint if exists buding_patchset_status_overrides_status_check;

alter table public.buding_patchset_status_overrides
  add constraint buding_patchset_status_overrides_status_check
  check (status in ('needs-revision', 'approved', 'rejected'));

-- Preserve legacy audit rows, but reject non-review statuses for new events.
alter table public.buding_patchset_status_events
  drop constraint if exists buding_patchset_status_events_status_check;

alter table public.buding_patchset_status_events
  add constraint buding_patchset_status_events_status_check
  check (status in ('needs-revision', 'approved', 'rejected')) not valid;
