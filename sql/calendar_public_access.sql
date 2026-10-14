-- Stage 1: additive public projections, before frontend deployment. No data changes.
begin;
set local lock_timeout = '5s';
create role fcd_calendar_reader nologin noinherit;
grant fcd_calendar_reader to postgres;
grant usage on schema public to fcd_calendar_reader;
grant select (id,team,event_date,starts_at,ends_at,place,capacity,kind,organization,status)
on public.schedule_requests to fcd_calendar_reader;
grant select (target_id,team,event_date,starts_at,ends_at,place,capacity)
on public.event_overrides to fcd_calendar_reader;
create policy calendar_reader_requests on public.schedule_requests
for select to fcd_calendar_reader using (status='freigegeben');
create policy calendar_reader_overrides on public.event_overrides
for select to fcd_calendar_reader using (true);
create function public.public_schedule_events()
returns table (id uuid,team text,event_date date,starts_at time,ends_at time,
place text,capacity text,kind text,organization text,status text)
language sql stable security definer set search_path=pg_catalog
as $$ select id,team,event_date,starts_at,ends_at,place,capacity,kind,organization,
'freigegeben'::text from public.schedule_requests where status='freigegeben' $$;
create function public.public_event_overrides()
returns table (target_id text,team text,event_date date,starts_at time,ends_at time,
place text,capacity text)
language sql stable security definer set search_path=pg_catalog
as $$ select target_id,team,event_date,starts_at,ends_at,place,capacity
from public.event_overrides $$;
grant create on schema public to fcd_calendar_reader;
alter function public.public_schedule_events() owner to fcd_calendar_reader;
alter function public.public_event_overrides() owner to fcd_calendar_reader;
revoke create on schema public from fcd_calendar_reader;
revoke all on function public.public_schedule_events(),public.public_event_overrides() from public;
grant execute on function public.public_schedule_events(),public.public_event_overrides() to anon,authenticated;
comment on function public.public_schedule_events() is 'Public approved calendar projection; restricted NOLOGIN owner with RLS and column ACLs. No notes or user identifiers.';
comment on function public.public_event_overrides() is 'Public effective appointment changes without notes; restricted NOLOGIN owner with RLS and column ACLs.';
notify pgrst,'reload schema';
commit;
