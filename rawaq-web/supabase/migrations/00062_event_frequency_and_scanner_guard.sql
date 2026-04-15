alter table public.events
  add column if not exists event_frequency text not null default 'one_time';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_event_frequency_check'
  ) then
    alter table public.events
      add constraint events_event_frequency_check
      check (event_frequency in ('one_time', 'weekly', 'monthly'));
  end if;
end $$;
