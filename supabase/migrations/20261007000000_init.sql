-- Plunder prototype schema: invite-only servers, text/voice channels, messages.
-- Privacy: we never store a birthdate, only whether the age check passed.

create extension if not exists pgcrypto with schema extensions;

-- Profiles ------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  age_verified_at timestamptz,
  age_verification_method text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'oyuncu')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Servers, members, channels ---------------------------------------------------

create table public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 64),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.server_members (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
create index server_members_user_idx on public.server_members (user_id);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 48),
  kind text not null check (kind in ('text', 'voice')),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index channels_server_idx on public.channels (server_id, position);

create table public.messages (
  id bigint generated always as identity primary key,
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_channel_idx on public.messages (channel_id, id desc);

create table public.invites (
  code text primary key,
  server_id uuid not null references public.servers (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  created_at timestamptz not null default now()
);

-- Helpers (security definer so RLS policies can call them without recursion) --

create function public.is_member(p_server uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.server_members
    where server_id = p_server and user_id = auth.uid()
  );
$$;

create function public.is_owner(p_server uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.server_members
    where server_id = p_server and user_id = auth.uid() and role = 'owner'
  );
$$;

create function public.is_age_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and age_verified_at is not null
  );
$$;

create function public.channel_server(p_channel uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select server_id from public.channels where id = p_channel;
$$;

-- Row level security -------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.invites enable row level security;

-- Profiles: you see yourself and people you share a server with.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.server_members a
      join public.server_members b on a.server_id = b.server_id
      where a.user_id = auth.uid() and b.user_id = profiles.id
    )
  );
-- Only the display name is user-editable; age fields go through verify_age_* RPCs.
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy servers_select on public.servers for select to authenticated
  using (public.is_member(id));
create policy servers_update on public.servers for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));
create policy servers_delete on public.servers for delete to authenticated
  using (public.is_owner(id));

create policy members_select on public.server_members for select to authenticated
  using (public.is_member(server_id));
-- Leave a server yourself, or the owner removes someone (never the owner row).
create policy members_delete on public.server_members for delete to authenticated
  using (role <> 'owner' and (user_id = auth.uid() or public.is_owner(server_id)));

create policy channels_select on public.channels for select to authenticated
  using (public.is_member(server_id));
create policy channels_write on public.channels for all to authenticated
  using (public.is_owner(server_id)) with check (public.is_owner(server_id));

create policy messages_select on public.messages for select to authenticated
  using (public.is_member(public.channel_server(channel_id)));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_age_verified()
    and public.is_member(public.channel_server(channel_id))
    and exists (select 1 from public.channels c where c.id = channel_id and c.kind = 'text')
  );
create policy messages_delete on public.messages for delete to authenticated
  using (author_id = auth.uid());

create policy invites_select on public.invites for select to authenticated
  using (public.is_member(server_id));
create policy invites_delete on public.invites for delete to authenticated
  using (created_by = auth.uid() or public.is_owner(server_id));

-- RPCs ------------------------------------------------------------------------------

-- Prototype age check: the client sends a birthdate, we keep only the result.
-- A real provider (age token, card check) replaces this; see packages/core/src/age.ts.
create function public.verify_age_self_declared(p_birthdate date) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  min_age constant int := 18;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_birthdate > (current_date - make_interval(years => min_age)) then
    return false;
  end if;
  update public.profiles
     set age_verified_at = now(), age_verification_method = 'self_declared'
   where id = auth.uid();
  return true;
end;
$$;

create function public.create_server(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_server uuid;
begin
  if not public.is_age_verified() then
    raise exception 'age verification required' using errcode = '42501';
  end if;
  insert into public.servers (name, owner_id) values (p_name, auth.uid()) returning id into v_server;
  insert into public.server_members (server_id, user_id, role) values (v_server, auth.uid(), 'owner');
  insert into public.channels (server_id, name, kind, position) values
    (v_server, 'genel', 'text', 0),
    (v_server, 'Sesli', 'voice', 1);
  return v_server;
end;
$$;

create function public.create_invite(p_server uuid, p_ttl_hours int default 168, p_max_uses int default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  if not public.is_member(p_server) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  -- 10 chars from an unambiguous alphabet, ~50 bits.
  select string_agg(substr('23456789abcdefghjkmnpqrstuvwxyz', 1 + (get_byte(b, i) % 31), 1), '')
    into v_code
    from (select extensions.gen_random_bytes(10) as b) r, generate_series(0, 9) i;
  insert into public.invites (code, server_id, created_by, expires_at, max_uses)
  values (
    v_code, p_server, auth.uid(),
    case when p_ttl_hours is null then null else now() + make_interval(hours => p_ttl_hours) end,
    p_max_uses
  );
  return v_code;
end;
$$;

create function public.redeem_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invites;
begin
  if not public.is_age_verified() then
    raise exception 'age verification required' using errcode = '42501';
  end if;
  select * into v_inv from public.invites where code = lower(trim(p_code)) for update;
  if not found
     or (v_inv.expires_at is not null and v_inv.expires_at < now())
     or (v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses) then
    raise exception 'invite invalid or expired' using errcode = 'P0002';
  end if;
  insert into public.server_members (server_id, user_id) values (v_inv.server_id, auth.uid())
    on conflict do nothing;
  if found then
    update public.invites set uses = uses + 1 where code = v_inv.code;
  end if;
  return v_inv.server_id;
end;
$$;

revoke execute on function public.verify_age_self_declared(date) from public, anon;
revoke execute on function public.create_server(text) from public, anon;
revoke execute on function public.create_invite(uuid, int, int) from public, anon;
revoke execute on function public.redeem_invite(text) from public, anon;
grant execute on function public.verify_age_self_declared(date) to authenticated;
grant execute on function public.create_server(text) to authenticated;
grant execute on function public.create_invite(uuid, int, int) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;

-- Realtime: stream new messages to channel members (RLS applies).
alter publication supabase_realtime add table public.messages;
