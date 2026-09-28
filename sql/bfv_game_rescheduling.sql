-- One open proposal per BFV game. The BFV UID is the stable reconciliation key.
create unique index if not exists schedule_requests_one_open_bfv_move
  on public.schedule_requests (target_id)
  where action = 'move' and status = 'beantragt' and target_id like 'bfv-%';

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
      if requested.capacity <> '1/1' then raise exception 'BFV-Spiele benötigen 1/1 Platz'; end if;
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

