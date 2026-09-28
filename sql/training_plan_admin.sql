-- Stable occurrence keys preserve existing overrides when a rule is renamed or retimed.
-- Nullable validity dates allow future season-specific rules without changing old rows.
alter table public.training_rules
  add column if not exists event_key_template text,
  add column if not exists valid_from date,
  add column if not exists valid_until date;

update public.training_rules
set event_key_template = 'standard-' || team || '-{date}-' || to_char(starts_at, 'HH24:MI')
where event_key_template is null;

alter table public.training_rules
  alter column event_key_template set default ('standard-rule-' || gen_random_uuid()::text || '-{date}'),
  alter column event_key_template set not null;

create unique index if not exists training_rules_weekday_event_key_idx
  on public.training_rules (weekday, event_key_template);

alter table public.training_rules
  add constraint training_rules_valid_dates
    check (valid_from is null or valid_until is null or valid_from <= valid_until),
  add constraint training_rules_event_key_date
    check (position('{date}' in event_key_template) > 0);

create or replace function private.capture_stat_day(p_day date)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  total integer;
begin
  if p_day < date '2026-10-01' or
     p_day >= (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Nur abgeschlossene Tage ab Oktober 2026 können erfasst werden';
  end if;
  if exists (select 1 from public.stat_capture_days where capture_date = p_day) then
    select event_count into total from public.stat_capture_days where capture_date = p_day;
    return total;
  end if;

  with candidates as (
    select g.id as event_id, coalesce(o.event_date, g.game_date) as event_date,
      g.source as team,
      case g.category when 'Pokal' then 'cup'
        when 'Freundschaftsspiel' then 'friendly' else 'league' end as kind,
      coalesce((select s.organization from public.bfv_sources s
        where s.team = g.source order by s.id limit 1), 'other') as organization,
      extract(epoch from (coalesce(o.ends_at, g.ends_at) -
        coalesce(o.starts_at, g.starts_at)))::integer / 60 as minutes
    from public.bfv_games g
    left join public.event_overrides o on o.target_id = g.id
    where g.status = 'Heimspiel'

    union all

    select replace(t.event_key_template, '{date}', p_day::text) as event_id,
      coalesce(o.event_date, p_day) as event_date,
      coalesce(o.team, t.team) as team,
      'training' as kind, t.organization,
      extract(epoch from (coalesce(o.ends_at, t.ends_at) -
        coalesce(o.starts_at, t.starts_at)))::integer / 60 as minutes
    from public.training_rules t
    left join public.event_overrides o on o.target_id =
      replace(t.event_key_template, '{date}', p_day::text)
    where t.active and t.weekday = extract(isodow from p_day)::integer
      and (t.valid_from is null or p_day >= t.valid_from)
      and (t.valid_until is null or p_day <= t.valid_until)

    union all

    select o.target_id as event_id, o.event_date, o.team,
      'training' as kind, coalesce(t.organization, 'other'),
      extract(epoch from (o.ends_at - o.starts_at))::integer / 60 as minutes
    from public.event_overrides o
    left join lateral (
      select x.organization from public.training_rules x
      where o.target_id like replace(x.event_key_template, '{date}', '____-__-__')
      order by x.team desc limit 1
    ) t on true
    where o.target_id like 'standard-%' and o.event_date = p_day

    union all

    select 'request-' || r.id::text as event_id,
      coalesce(o.event_date, r.event_date) as event_date,
      coalesce(o.team, r.team) as team,
      r.kind, r.organization,
      extract(epoch from (coalesce(o.ends_at, r.ends_at) -
        coalesce(o.starts_at, r.starts_at)))::integer / 60 as minutes
    from public.schedule_requests r
    left join public.event_overrides o on o.target_id = 'request-' || r.id::text
    where r.action = 'new' and r.status = 'freigegeben'
  ), chosen as (
    select distinct on (c.event_id) c.event_id, c.event_date, c.team,
      c.kind, c.organization, c.minutes
    from candidates c
    where c.event_date = p_day and c.minutes > 0
      and not exists (
        select 1 from public.event_deletions d where d.target_id = c.event_id
      )
    order by c.event_id
  )
  insert into public.stat_events (event_id, event_date, team, kind, organization, minutes)
    select event_id, event_date, team, kind, organization, minutes from chosen
    on conflict (event_id) do nothing;

  select count(*) into total from public.stat_events where event_date = p_day;
  insert into public.stat_capture_days (capture_date, event_count)
    values (p_day, total);
  return total;
end;
$$;
