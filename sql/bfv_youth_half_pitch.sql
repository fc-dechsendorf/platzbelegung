-- C- to G-youth BFV fixtures may use half or full pitch; other BFV fixtures remain full pitch.
create or replace function public.bfv_youth_half_pitch_allowed(p_game_id text)
returns boolean
language sql stable security invoker
set search_path = public, pg_temp
as $function$
  select coalesce((
    select exists (
      select 1 from public.bfv_sources s
      where s.id = any(g.source_ids)
        and s.team ~* '^[C-G]-Jugend( +[0-9]+)?$'
        and (
          (g.name ~* '^(\(SG\)[[:space:]]*)?FC Dechsendorf([[:space:]]|-)' and s.organization = 'fcd')
          or (g.name ~* '^Atl[eé]tico Erlangen([[:space:]]|-)' and s.organization = 'atletico')
          or (g.name !~* '^(\(SG\)[[:space:]]*)?FC Dechsendorf([[:space:]]|-)'
            and g.name !~* '^Atl[eé]tico Erlangen([[:space:]]|-)'
            and cardinality(g.source_ids) = 1)
        )
    ) from public.bfv_games g where g.id = p_game_id
  ), false);
$function$;

create or replace function public.validate_bfv_override_capacity()
returns trigger
language plpgsql security invoker
set search_path = public, pg_temp
as $function$
begin
  if new.target_id like 'bfv-%' and not (
    new.capacity = '1/1' or
    (new.capacity = '1/2' and public.bfv_youth_half_pitch_allowed(new.target_id))
  ) then
    raise exception 'Nur BFV-Spiele der C- bis G-Jugend dürfen 1/2 Platz nutzen';
  end if;
  return new;
end;
$function$;

drop trigger if exists bfv_override_capacity_guard on public.event_overrides;
create trigger bfv_override_capacity_guard
  before insert or update on public.event_overrides
  for each row execute function public.validate_bfv_override_capacity();

create or replace function public.approve_schedule_request(p_request_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  requested public.schedule_requests%rowtype;
  official public.bfv_games%rowtype;
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'fcd_role') is distinct from 'admin' then
    raise exception 'Administratorrechte erforderlich' using errcode = '42501';
  end if;

  select * into requested from public.schedule_requests where id = p_request_id for update;
  if not found then raise exception 'Antrag nicht gefunden'; end if;
  if requested.status <> 'beantragt' then raise exception 'Antrag ist nicht mehr offen'; end if;

  if requested.action = 'new' then
    update public.schedule_requests set status = 'freigegeben' where id = p_request_id;
    return;
  end if;
  if requested.target_id is null then raise exception 'Zieltermin fehlt'; end if;

  if requested.action = 'move' then
    if requested.event_date is null or requested.starts_at >= requested.ends_at
      or requested.place not in ('A', 'B', 'C') then
      raise exception 'Ungültige Spiel- oder Trainingsverlegung';
    end if;
    if requested.target_id like 'bfv-%' then
      select * into official from public.bfv_games where id = requested.target_id;
      if not found then raise exception 'BFV-ID ist im aktuellen Datenbestand nicht vorhanden'; end if;
      if requested.capacity <> '1/1' and not (
        requested.capacity = '1/2' and public.bfv_youth_half_pitch_allowed(requested.target_id)
      ) then
        raise exception 'Nur BFV-Spiele der C- bis G-Jugend dürfen 1/2 Platz nutzen';
      end if;
    end if;
    insert into public.event_overrides
      (target_id, team, event_date, starts_at, ends_at, place, capacity, note)
    values (requested.target_id,
      case when requested.target_id like 'bfv-%' then official.name else requested.team end,
      requested.event_date, requested.starts_at, requested.ends_at,
      requested.place, requested.capacity, requested.note)
    on conflict (target_id) do update set
      team = excluded.team, event_date = excluded.event_date,
      starts_at = excluded.starts_at, ends_at = excluded.ends_at,
      place = excluded.place, capacity = excluded.capacity, note = excluded.note;
  elsif requested.action = 'delete' then
    insert into public.event_deletions(target_id) values(requested.target_id) on conflict do nothing;
  else
    raise exception 'Unbekannte Antragsart';
  end if;
  delete from public.schedule_requests where id = p_request_id;
end;
$function$;

