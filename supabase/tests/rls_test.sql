-- Behaviour tests for the init migration. Any failed assert aborts with a non-zero exit.
\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ayse@example.com', '{"display_name":"Ayşe"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bora@example.com', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'cem@example.com', '{}');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false);
$$;

set role authenticated;

-- Profile created by trigger, display name from metadata or email.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a') \g /dev/null
do $$ begin
  assert (select display_name from public.profiles where id = auth.uid()) = 'Ayşe', 'profile trigger';
end $$;

-- Cannot create a server before the age check.
do $$ begin
  perform public.create_server('Erken');
  raise exception 'expected failure';
exception when insufficient_privilege then null;
end $$;

-- Under-18 birthdate is rejected and leaves no trace; adult passes.
do $$ begin
  assert public.verify_age_self_declared((current_date - interval '16 years')::date) = false, 'minor rejected';
  assert (select age_verified_at from public.profiles where id = auth.uid()) is null, 'minor not stored';
  assert public.verify_age_self_declared(date '1995-05-05') = true, 'adult accepted';
end $$;

-- Users cannot self-set the age flag directly.
do $$ begin
  update public.profiles set age_verified_at = now() where id = auth.uid();
  raise exception 'expected failure';
exception when insufficient_privilege then null;
end $$;

-- Create server: owner membership and default channels.
create temp table ctx (server_id uuid, code text) ;
grant all on ctx to authenticated;
insert into ctx (server_id) select public.create_server('Akşam Ekibi');
do $$ declare s uuid := (select server_id from ctx); begin
  assert (select count(*) from public.channels where server_id = s) = 2, 'default channels';
  assert public.is_owner(s), 'owner';
end $$;
update ctx set code = public.create_invite((select server_id from ctx), 24, 1);

insert into public.messages (channel_id, author_id, body)
select id, auth.uid(), 'selam' from public.channels where server_id = (select server_id from ctx) and kind = 'text';

-- Cannot post into a voice channel.
do $$ begin
  insert into public.messages (channel_id, author_id, body)
  select id, auth.uid(), 'x' from public.channels where server_id = (select server_id from ctx) and kind = 'voice';
  raise exception 'expected failure';
exception when insufficient_privilege then null;
end $$;

-- Outsider sees nothing.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b') \g /dev/null
do $$ begin
  assert (select count(*) from public.servers) = 0, 'outsider servers hidden';
  assert (select count(*) from public.messages) = 0, 'outsider messages hidden';
  assert (select count(*) from public.channels) = 0, 'outsider channels hidden';
  assert (select count(*) from public.profiles) = 1, 'outsider sees only self';
end $$;

-- Bora verifies and joins with the invite; then can read and write.
do $$ begin
  perform public.verify_age_self_declared(date '2000-01-01');
  assert public.redeem_invite(upper((select code from ctx))) = (select server_id from ctx), 'redeem';
  assert (select count(*) from public.messages) = 1, 'member reads';
  assert (select count(*) from public.profiles) = 2, 'member sees co-member';
end $$;
insert into public.messages (channel_id, author_id, body)
select id, auth.uid(), 'naber' from public.channels where server_id = (select server_id from ctx) and kind = 'text';

-- Cannot impersonate another author.
do $$ begin
  insert into public.messages (channel_id, author_id, body)
  select id, '00000000-0000-0000-0000-00000000000a', 'sahte' from public.channels
   where server_id = (select server_id from ctx) and kind = 'text';
  raise exception 'expected failure';
exception when insufficient_privilege then null;
end $$;

-- Member cannot rename the server or kick the owner.
do $$ begin
  update public.servers set name = 'hack' where id = (select server_id from ctx);
  assert (select name from public.servers where id = (select server_id from ctx)) = 'Akşam Ekibi', 'member cannot rename';
  delete from public.server_members where role = 'owner';
  assert (select count(*) from public.server_members) = 2, 'owner row protected';
end $$;

-- Single-use invite is spent.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c') \g /dev/null
do $$ begin
  perform public.verify_age_self_declared(date '2000-01-01');
  perform public.redeem_invite((select code from ctx));
  raise exception 'expected failure';
exception when no_data_found then null;
end $$;

-- Anonymous role cannot call RPCs.
reset role;
set role anon;
do $$ begin
  perform public.create_server('anon');
  raise exception 'expected failure';
exception when insufficient_privilege then null;
end $$;
reset role;
\echo 'ALL RLS TESTS PASSED'
