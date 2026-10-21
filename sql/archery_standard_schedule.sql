-- Wiederkehrende Bogenschützen-Hinweiszeiten, getrennt von Fußballtrainings.
-- Der C-Platz und die vereinbarte 1/2-Platz-Sperrzone bleiben Kalenderregeln.
create table if not exists public.archery_rules (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  season_start_month smallint not null default 4 check (season_start_month between 1 and 12),
  season_end_month smallint not null default 9 check (season_end_month between 1 and 12),
  active boolean not null default true,
  seed_key text unique,
  constraint archery_rules_time_order check (starts_at < ends_at),
  constraint archery_rules_quarter_hours check (
    extract(minute from starts_at)::integer % 15 = 0 and
    extract(minute from ends_at)::integer % 15 = 0 and
    extract(second from starts_at) = 0 and extract(second from ends_at) = 0
  ),
  constraint archery_rules_month_order check (season_start_month <= season_end_month)
);

alter table public.archery_rules enable row level security;
revoke all on public.archery_rules from public, anon, authenticated;
grant select on public.archery_rules to anon, authenticated;
grant insert, update on public.archery_rules to authenticated;

create policy archery_public_read on public.archery_rules
  for select to anon, authenticated using (true);
create policy archery_admin_insert on public.archery_rules
  for insert to authenticated
  with check ((select fcd_security.current_session_role()) = 'admin');
create policy archery_admin_update on public.archery_rules
  for update to authenticated
  using ((select fcd_security.current_session_role()) = 'admin')
  with check ((select fcd_security.current_session_role()) = 'admin');

-- Bisher veröffentlichte Zeiten bleiben unverändert, bis ein Admin sie bearbeitet.
insert into public.archery_rules
  (weekday, starts_at, ends_at, season_start_month, season_end_month, seed_key)
values
  (3, '17:30', '19:00', 4, 9, 'initial-wednesday'),
  (5, '17:30', '19:00', 4, 9, 'initial-friday')
on conflict (seed_key) do nothing;
