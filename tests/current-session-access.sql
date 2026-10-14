begin;

do $test$
declare uid uuid; other_uid uuid; sid uuid:=gen_random_uuid();
 original_metadata jsonb; original_ban timestamptz; r text; request_id uuid; other_request uuid;
 hall_id uuid; n integer; base_requests integer; base_overrides integer; base_hall integer;
begin
 select id,raw_app_meta_data,banned_until into uid,original_metadata,original_ban from auth.users where raw_app_meta_data->>'fcd_role'='manager' limit 1;
 select id into other_uid from auth.users where id<>uid limit 1;
 if uid is null or other_uid is null then raise exception 'Existing users missing'; end if;
 select count(*) into base_requests from public.public_schedule_events();
 select count(*) into base_overrides from public.public_event_overrides();
 select count(*) into base_hall from public.hall_bookings;
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,uid,now(),now());
 insert into public.schedule_requests(action,team,event_date,starts_at,ends_at,place,capacity,note,created_by)
 values('new','Security own rollback fixture','2099-12-31','09:00','10:00','C','1/2','PRIVATE',uid) returning id into request_id;
 insert into public.schedule_requests(action,team,event_date,starts_at,ends_at,place,capacity,note,created_by)
 values('new','Security other rollback fixture','2099-12-31','09:00','10:00','C','1/2','PRIVATE',other_uid) returning id into other_request;
 insert into public.stat_events(event_id,event_date,team,kind,organization,minutes)
 values('security-session-rollback-fixture','2099-12-31','Security rollback fixture','training','fcd',60);
 foreach r in array array['manager','board','','disabled','admin'] loop
  update auth.users set raw_app_meta_data=jsonb_set(coalesce(original_metadata,'{}'::jsonb),'{fcd_role}',to_jsonb(r)),banned_until=null where id=uid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid,'app_metadata',jsonb_build_object('fcd_role',r))::text,true);
  perform set_config('role','authenticated',true);
  if r in ('admin','manager','board') and fcd_security.current_session_role() is distinct from r then raise exception 'Current role rejected: %',r; end if;
  if r not in ('admin','manager','board') and fcd_security.current_session_role() is not null then raise exception 'Unauthorized role accepted'; end if;
  if r in ('admin','manager') and not exists(select 1 from public.schedule_requests where id=request_id) then raise exception 'Own request hidden: %',r; end if;
  if r='manager' and exists(select 1 from public.schedule_requests where id=other_request) then raise exception 'Other owner visible'; end if;
  if r not in ('admin','manager') and exists(select 1 from public.schedule_requests) then raise exception 'Private requests visible: %',r; end if;
  if r<>'admin' and exists(select 1 from public.event_overrides) then raise exception 'Private override visible: %',r; end if;
  if r in ('admin','board') then
   if not exists(select 1 from public.board_statistics() where calendar_year=2099 and team='Security rollback fixture') then raise exception 'Statistics unavailable: %',r; end if;
  else
   if exists(select 1 from public.stat_events) then raise exception 'Private statistics visible: %',r; end if;
   begin perform public.board_statistics(); raise exception 'Unauthorized statistics RPC'; exception when insufficient_privilege then null; end;
  end if;
  if (select count(*) from public.public_schedule_events())<>base_requests or (select count(*) from public.public_event_overrides())<>base_overrides then raise exception 'Public projection changed'; end if;
  update public.hall_settings set public_visible=public_visible where id=1;
  get diagnostics n=row_count;
  if n<>(case when r='admin' then 1 else 0 end) then raise exception 'Settings update: %',r; end if;
  begin
   insert into public.hall_bookings(weekday,hall,start_minute,end_minute,label)
   values(7,0,0,30,'Security rollback fixture') returning id into hall_id;
   if r<>'admin' then raise exception 'Unauthorized hall insert: %',r; end if;
   update public.hall_bookings set label='Security updated fixture' where id=hall_id;
   get diagnostics n=row_count;
   if n<>1 then raise exception 'Admin hall update'; end if;
   delete from public.hall_bookings where id=hall_id;
   get diagnostics n=row_count;
   if n<>1 then raise exception 'Admin hall delete'; end if;
  exception when insufficient_privilege then if r='admin' then raise; end if; end;
  if r in ('admin','manager') then
   insert into public.schedule_requests(action,team,event_date,starts_at,ends_at,place,capacity,note)
   values('new','Security workflow fixture','2099-12-30','09:00','10:00','C','1/2','PRIVATE') returning id into hall_id;
   if r='manager' then
    begin perform public.approve_schedule_request(hall_id); raise exception 'Manager approval allowed'; exception when insufficient_privilege then null; end;
   else
    perform public.approve_schedule_request(hall_id);
    if not exists(select 1 from public.public_schedule_events() where id=hall_id) then raise exception 'Approved calendar event missing'; end if;
    delete from public.schedule_requests where id=hall_id;
   end if;
  end if;
  perform set_config('role','postgres',true);
 end loop;
 -- Current admin with absent, malformed, expired or mismatched session is denied.
 update auth.users set raw_app_meta_data=jsonb_set(coalesce(original_metadata,'{}'::jsonb),'{fcd_role}','"admin"'::jsonb) where id=uid;
 foreach r in array array['missing','malformed','expired','banned','wrong_user','stale_role'] loop
  update auth.sessions set not_after=case when r='expired' then now()-interval '1 minute' else null end where id=sid;
  update auth.users set banned_until=case when r='banned' then now()+interval '1 hour' else null end where id=uid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',case when r='wrong_user' then other_uid else uid end,'role','authenticated',
   'session_id',case when r='missing' then gen_random_uuid()::text when r='malformed' then 'invalid-session' else sid::text end,
   'app_metadata',jsonb_build_object('fcd_role',case when r='stale_role' then 'manager' else 'admin' end))::text,true);
  perform set_config('role','authenticated',true);
  if fcd_security.current_session_role() is not null then raise exception 'Invalid session accepted: %',r; end if;
  if exists(select 1 from public.schedule_requests) or exists(select 1 from public.event_overrides) or exists(select 1 from public.stat_events) then raise exception 'Private read with invalid session: %',r; end if;
  update public.hall_settings set public_visible=public_visible where id=1;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Invalid session settings write: %',r; end if;
  begin
   insert into public.hall_bookings(weekday,hall,start_minute,end_minute,label) values(7,0,0,30,'Invalid session');
   raise exception 'Invalid session insert: %',r;
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.hall_bookings)<>base_hall then raise exception 'Public hall unavailable'; end if;
  perform set_config('role','postgres',true);
 end loop;
 -- Hidden hall remains hidden to anon, even an old admin token cannot reopen it.
 update public.hall_settings set public_visible=false where id=1;
 perform set_config('role','authenticated',true);
 if exists(select 1 from public.hall_bookings) then raise exception 'Stale role sees hidden hall'; end if;
 perform set_config('role','postgres',true);
 perform set_config('role','anon',true);
 if exists(select 1 from public.hall_bookings) then raise exception 'Anonymous hidden hall'; end if;
 if (select count(*) from public.public_schedule_events())<>base_requests then raise exception 'Anonymous public calendar'; end if;
 perform set_config('role','postgres',true);
 if has_function_privilege('anon','fcd_security.current_session_role()','EXECUTE') then raise exception 'Anonymous private helper'; end if;
 update auth.users set raw_app_meta_data=original_metadata,banned_until=original_ban where id=uid;
end $test$;
rollback;
select 'PASS: anon/authenticated/admin/manager/board/disabled; own and foreign requests; approval; hall CRUD; statistics; missing/malformed/expired/banned/wrong-user/stale-role sessions; public calendar; all test changes rolled back' as result;

