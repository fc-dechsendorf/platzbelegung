-- Dokumentation der am 13.10.2026 angewandten Hallen-Schemaänderung.
-- Auf der bestehenden Datenbank nicht erneut ausführen: Die offiziellen
-- Beispielbelegungen sind bereits angelegt und werden fortan im Admin-Bereich gepflegt.
create extension if not exists btree_gist with schema extensions;

create table public.hall_settings (
  id integer primary key check (id = 1),
  public_visible boolean not null default false
);

create table public.hall_bookings (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 1 and 7),
  hall smallint not null check (hall between 0 and 1),
  start_minute smallint not null check (start_minute between 0 and 1410 and start_minute % 30 = 0),
  end_minute smallint not null check (end_minute between 30 and 1440 and end_minute % 30 = 0),
  label text not null check (length(trim(label)) between 1 and 80),
  updated_at timestamptz not null default now(),
  constraint hall_time_order check (end_minute > start_minute),
  constraint hall_no_overlap exclude using gist
    (weekday with =, hall with =,
     int4range(start_minute::integer, end_minute::integer, '[)') with &&)
);

alter table public.hall_settings enable row level security;
alter table public.hall_bookings enable row level security;
grant select on public.hall_settings to anon, authenticated;
grant update on public.hall_settings to authenticated;
grant select on public.hall_bookings to anon, authenticated;
grant insert, update, delete on public.hall_bookings to authenticated;

create policy hall_settings_read on public.hall_settings
  for select to anon, authenticated using (true);
create policy hall_settings_admin_update on public.hall_settings
  for update to authenticated
  using (((select auth.jwt())->'app_metadata'->>'fcd_role') = 'admin')
  with check (((select auth.jwt())->'app_metadata'->>'fcd_role') = 'admin');
create policy hall_bookings_read on public.hall_bookings
  for select to anon, authenticated
  using ((select public_visible from public.hall_settings where id = 1)
    or ((select auth.jwt())->'app_metadata'->>'fcd_role') = 'admin');
create policy hall_bookings_admin_insert on public.hall_bookings
  for insert to authenticated
  with check (((select auth.jwt())->'app_metadata'->>'fcd_role') = 'admin');
create policy hall_bookings_admin_update on public.hall_bookings
  for update to authenticated
  using (((select auth.jwt())->'app_metadata'->>'fcd_role') = 'admin')
  with check (((select auth.jwt())->'app_metadata'->>'fcd_role') = 'admin');
create policy hall_bookings_admin_delete on public.hall_bookings
  for delete to authenticated
  using (((select auth.jwt())->'app_metadata'->>'fcd_role') = 'admin');

insert into public.hall_settings (id, public_visible) values (1, true);
insert into public.hall_bookings (weekday,hall,start_minute,end_minute,label) values
  (4,0,1020,1140,'G-Jugend'), (4,0,1200,1290,'AH'),
  (6,0,540,630,'D-Jugend'), (6,0,630,720,'F-Jugend'),
  (6,0,720,810,'A-Jugend'), (6,0,810,900,'Bambini'),
  (6,1,900,1020,'Jugend'), (6,1,1020,1140,'AH');
