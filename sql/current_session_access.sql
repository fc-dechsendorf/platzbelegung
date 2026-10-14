-- Ergänzt die bestehenden RLS-Regeln; keine Vereinsdaten werden geändert.
-- Prüft nur die eigene Sitzung, aktuelle Rolle und Kontosperre; keine Benutzer-ID-Argumente.
begin;
set local lock_timeout='5s';
create schema if not exists fcd_security;
revoke all on schema fcd_security from public;
grant usage on schema fcd_security to authenticated;
create function fcd_security.current_session_role()
returns text language sql stable security definer set search_path=pg_catalog
as $$
 select u.raw_app_meta_data->>'fcd_role'
 from auth.users u join auth.sessions s on s.user_id=u.id
 where u.id=(select auth.uid())
 and s.id=case
   when ((select auth.jwt())->>'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   then ((select auth.jwt())->>'session_id')::uuid else null::uuid end
 and (u.banned_until is null or u.banned_until<=statement_timestamp())
 and (s.not_after is null or s.not_after>statement_timestamp())
 and u.raw_app_meta_data->>'fcd_role' in ('admin','manager','board')
 and u.raw_app_meta_data->>'fcd_role'=((select auth.jwt())->'app_metadata'->>'fcd_role')
$$;
revoke all on function fcd_security.current_session_role() from public,anon;
grant execute on function fcd_security.current_session_role() to authenticated;
comment on function fcd_security.current_session_role() is 'Own-session authorization only. Private SECURITY DEFINER required for protected auth.users/auth.sessions lookup. No caller-selected user IDs; no personal data returned.';
do $policies$
declare tbl text; command text; allowed text;
begin
 foreach tbl in array array['training_rules','mowing_dates','bfv_sources','bfv_games','event_overrides','event_deletions','place_blocks','schedule_requests','hall_bookings','hall_settings'] loop
  allowed:=case when tbl='schedule_requests'
   then '(select fcd_security.current_session_role()) in (''admin'',''manager'')'
   else '(select fcd_security.current_session_role()) = ''admin''' end;
  foreach command in array array['insert','update','delete'] loop
   if tbl='hall_settings' and command<>'update' then continue; end if;
   execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
    'current_session_'||command,tbl,command,
    case command when 'insert' then 'with check ('||allowed||')'
     when 'delete' then 'using ('||allowed||')'
     else 'using ('||allowed||') with check ('||allowed||')' end);
  end loop;
 end loop;
end $policies$;
create policy current_session_read on public.schedule_requests as restrictive
for select to authenticated using ((select fcd_security.current_session_role()) in ('admin','manager'));
create policy current_session_read on public.event_overrides as restrictive
for select to authenticated using ((select fcd_security.current_session_role())='admin');
create policy current_session_read on public.stat_events as restrictive
for select to authenticated using ((select fcd_security.current_session_role()) in ('admin','board'));
create policy current_session_read on public.stat_capture_days as restrictive
for select to authenticated using ((select fcd_security.current_session_role()) in ('admin','board'));
create policy current_session_read on public.hall_bookings as restrictive
for select to authenticated using ((select public_visible from public.hall_settings where id=1)
 or (select fcd_security.current_session_role())='admin');
-- Öffentliche Projektionen laufen weiterhin unter fcd_calendar_reader, nicht authenticated.
commit;


