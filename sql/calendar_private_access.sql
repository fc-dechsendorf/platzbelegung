-- Stage 2: after verifying updated frontend deployment. No data changes.
begin;
set local lock_timeout='5s';
revoke all on public.hall_bookings,public.hall_settings from anon,authenticated;
grant select on public.hall_bookings,public.hall_settings to anon,authenticated;
grant insert,update,delete on public.hall_bookings to authenticated;
grant update on public.hall_settings to authenticated;
revoke all on public.schedule_requests,public.event_overrides from anon;
alter policy public_read_requests on public.schedule_requests to authenticated
using (((select auth.jwt())->'app_metadata'->>'fcd_role')='admin'
or (((select auth.jwt())->'app_metadata'->>'fcd_role')='manager' and created_by=(select auth.uid())));
alter policy public_read_overrides on public.event_overrides to authenticated
using (((select auth.jwt())->'app_metadata'->>'fcd_role')='admin');
alter default privileges for role postgres in schema public revoke all on tables from anon,authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon,authenticated;
-- PUBLIC EXECUTE default is global; schema-specific revoke cannot remove it.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon,authenticated;
notify pgrst,'reload schema';
commit;
