-- The event site: registrations, sponsor credit codes and their audit log.
-- People sign in with Supabase Auth. Admin work goes through the server with
-- the secret key; participants reach only their own rows.

create table public.registrations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  email text not null,
  role text not null check (role in ('student', 'professional', 'designer', 'other')),
  team_status text not null check (team_status in ('have_team', 'looking', 'solo')),
  team_name text check (team_name is null or length(team_name) <= 80),
  dietary text check (dietary is null or length(dietary) <= 200),
  consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 1 and 80),
  offer text not null default '',
  -- Tell the crew when this many codes or fewer are left.
  low_at integer not null default 5 check (low_at >= 0),
  low_alerted boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.sponsor_codes (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors (id) on delete cascade,
  code text not null check (length(code) between 1 and 200),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  -- A revoked code is burnt: it never goes back into the pool.
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sponsor_id, code)
);

-- One live code per person per sponsor.
create unique index sponsor_codes_one_per_person
  on public.sponsor_codes (sponsor_id, claimed_by)
  where claimed_by is not null and revoked_at is null;
create index sponsor_codes_free on public.sponsor_codes (sponsor_id, created_at)
  where claimed_by is null and revoked_at is null;

create table public.claim_log (
  id bigint generated always as identity primary key,
  sponsor_id uuid references public.sponsors (id) on delete cascade,
  code_id uuid references public.sponsor_codes (id) on delete set null,
  user_id uuid,
  action text not null check (action in ('add', 'claim', 'revoke')),
  by_email text,
  note text,
  at timestamptz not null default now()
);

alter table public.registrations enable row level security;
alter table public.sponsors enable row level security;
alter table public.sponsor_codes enable row level security;
alter table public.claim_log enable row level security;

create policy "own registration: read" on public.registrations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own registration: create" on public.registrations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own registration: update" on public.registrations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "sponsors are public" on public.sponsors for select to anon, authenticated using (true);

create policy "own codes: read" on public.sponsor_codes
  for select to authenticated using ((select auth.uid()) = claimed_by and revoked_at is null);

-- claim_log: no policies, so only the server (secret key) reads it.

-- Claim one code from a sponsor's pool, atomically. A person who already
-- holds a live code from this sponsor gets that one back.
create or replace function public.claim_code(p_sponsor uuid)
returns table (code text, left_count integer, low_at integer, already boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  got public.sponsor_codes%rowtype;
  s public.sponsors%rowtype;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.registrations r where r.user_id = uid) then
    raise exception 'Register for the event first.' using errcode = 'P0001';
  end if;
  select * into s from public.sponsors where id = p_sponsor;
  if not found then
    raise exception 'No such sponsor.' using errcode = 'P0002';
  end if;

  select * into got from public.sponsor_codes c
    where c.sponsor_id = p_sponsor and c.claimed_by = uid and c.revoked_at is null;
  if found then
    return query select got.code,
      (select count(*)::integer from public.sponsor_codes f where f.sponsor_id = p_sponsor and f.claimed_by is null and f.revoked_at is null),
      s.low_at, true;
    return;
  end if;

  update public.sponsor_codes c set claimed_by = uid, claimed_at = now()
    where c.id = (
      select f.id from public.sponsor_codes f
      where f.sponsor_id = p_sponsor and f.claimed_by is null and f.revoked_at is null
      order by f.created_at, f.id
      limit 1
      for update skip locked
    )
    returning * into got;
  if not found then
    raise exception 'All of these codes have been claimed.' using errcode = 'P0003';
  end if;

  insert into public.claim_log (sponsor_id, code_id, user_id, action)
    values (p_sponsor, got.id, uid, 'claim');

  return query select got.code,
    (select count(*)::integer from public.sponsor_codes f where f.sponsor_id = p_sponsor and f.claimed_by is null and f.revoked_at is null),
    s.low_at, false;
end;
$$;

revoke all on function public.claim_code(uuid) from public, anon;
grant execute on function public.claim_code(uuid) to authenticated;
