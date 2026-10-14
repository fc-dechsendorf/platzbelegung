-- Opt-in MFA for the existing principal administrator only. No factor is enrolled here.
begin;
set local lock_timeout='5s';
create table fcd_security.mfa_accounts (
 user_id uuid primary key references auth.users(id),
 required boolean not null default false,
 recovery_session uuid,
 attempts integer not null default 0,
 attempt_window timestamptz not null default now()
);
create table fcd_security.mfa_recovery_codes (
 user_id uuid not null references fcd_security.mfa_accounts(user_id),
 digest text not null check (digest ~ '^[0-9a-f]{64}$'),
 used_at timestamptz,
 primary key(user_id,digest)
);
alter table fcd_security.mfa_accounts enable row level security;
alter table fcd_security.mfa_recovery_codes enable row level security;
revoke all on fcd_security.mfa_accounts,fcd_security.mfa_recovery_codes from public,anon,authenticated;

-- Only the trusted Edge Function may operate recovery records; serializes concurrent attempts.
create function public.owner_mfa_control(p_user uuid,p_session uuid,p_action text,p_hashes text[] default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a fcd_security.mfa_accounts%rowtype; strong boolean; remaining integer;
begin
 if p_user <> '25f4325b-18d1-40ba-9645-8fec15ea5855'::uuid then
  raise exception 'Nicht berechtigt' using errcode='42501';
 end if;
 if not exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
  where u.id=p_user and s.id=p_session and u.raw_app_meta_data->>'fcd_role'='admin'
  and (u.banned_until is null or u.banned_until<=statement_timestamp())
  and (s.not_after is null or s.not_after>statement_timestamp())) then
  raise exception 'Sitzung ungültig' using errcode='42501';
 end if;
 insert into fcd_security.mfa_accounts(user_id) values(p_user) on conflict do nothing;
 select * into a from fcd_security.mfa_accounts where user_id=p_user for update;
 select exists(select 1 from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id
  where s.id=p_session and s.user_id=p_user and s.aal='aal2'
  and f.user_id=p_user and f.status='verified') into strong;
 select count(*) into remaining from fcd_security.mfa_recovery_codes where user_id=p_user and used_at is null;
 if p_action='status' then
  return jsonb_build_object('required',a.required,'strong',strong,
   'recovering',a.recovery_session=p_session,'blocked',a.required and (not strong or a.recovery_session is not null),
   'remaining',remaining);
 elsif p_action='attempt' then
  if a.attempt_window<statement_timestamp()-interval '15 minutes' then
   a.attempts:=0; a.attempt_window:=statement_timestamp();
  end if;
  if a.attempts>=5 then return jsonb_build_object('allowed',false); end if;
  update fcd_security.mfa_accounts set attempts=a.attempts+1,attempt_window=a.attempt_window where user_id=p_user;
  return jsonb_build_object('allowed',true);
 elsif p_action='recover' then
  if not a.required or coalesce(cardinality(p_hashes),0)<>1 then raise exception 'Wiederherstellung nicht möglich'; end if;
  update fcd_security.mfa_recovery_codes set used_at=statement_timestamp()
   where user_id=p_user and digest=p_hashes[1] and used_at is null;
  if not found then return jsonb_build_object('ok',false); end if;
  update fcd_security.mfa_accounts set recovery_session=p_session where user_id=p_user;
  return jsonb_build_object('ok',true);
 elsif p_action='codes' then
  if not strong or (a.recovery_session is not null and a.recovery_session<>p_session) then
   raise exception 'App-Bestätigung erforderlich' using errcode='42501';
  end if;
  if coalesce(cardinality(p_hashes),0)<>10 or exists(select 1 from unnest(p_hashes) h where h !~ '^[0-9a-f]{64}$')
   or (select count(distinct h) from unnest(p_hashes) h)<>10 then raise exception 'Ungültige Codes'; end if;
  delete from fcd_security.mfa_recovery_codes where user_id=p_user;
  insert into fcd_security.mfa_recovery_codes(user_id,digest) select p_user,h from unnest(p_hashes) h;
  return jsonb_build_object('ok',true);
 elsif p_action='activate' then
  if not strong or remaining<>10 or (a.recovery_session is not null and a.recovery_session<>p_session) then
   raise exception 'App und Ersatzcodes zuerst einrichten' using errcode='42501';
  end if;
  update fcd_security.mfa_accounts set required=true,recovery_session=null,attempts=0 where user_id=p_user;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unbekannte Aktion';
end $$;
revoke all on function public.owner_mfa_control(uuid,uuid,text,text[]) from public,anon,authenticated;
grant execute on function public.owner_mfa_control(uuid,uuid,text,text[]) to service_role;

create or replace function fcd_security.current_session_role()
returns text language sql stable security definer set search_path=pg_catalog as $$
 select u.raw_app_meta_data->>'fcd_role'
 from auth.users u join auth.sessions s on s.user_id=u.id
 where u.id=(select auth.uid())
 and s.id=case when ((select auth.jwt())->>'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then ((select auth.jwt())->>'session_id')::uuid else null::uuid end
 and (u.banned_until is null or u.banned_until<=statement_timestamp())
 and (s.not_after is null or s.not_after>statement_timestamp())
 and u.raw_app_meta_data->>'fcd_role' in ('admin','manager','board')
 and u.raw_app_meta_data->>'fcd_role'=((select auth.jwt())->'app_metadata'->>'fcd_role')
 and not exists(select 1 from fcd_security.mfa_accounts a where a.user_id=u.id and a.required
  and (a.recovery_session is not null or coalesce((select auth.jwt())->>'aal','aal1')<>'aal2'
   or s.aal is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f
    where f.id=s.factor_id and f.user_id=u.id and f.status='verified')))
$$;
-- Used by authenticated Edge Functions with their caller JWT, never a caller-selected ID.
create function public.protected_session_role() returns text language sql stable security invoker
set search_path=pg_catalog as $$ select fcd_security.current_session_role() $$;
revoke all on function public.protected_session_role() from public,anon;
grant execute on function public.protected_session_role() to authenticated;
commit;
