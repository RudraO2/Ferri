-- RSVP (spec 17): one guest list per event. Every registration has a status:
-- going (has a spot), waitlist (waits for one) or cancelled (freed their spot).
-- Additive and safe on a live project: existing registrations become going.
-- The capacity lives in the site's content/event.json. The server decides a
-- status with the secret key; Ferri moves people through /api/ferri/guests.

alter table public.registrations
  add column if not exists status text not null default 'going'
    check (status in ('going', 'waitlist', 'cancelled')),
  -- When the status last changed. The waitlist is in this order.
  add column if not exists status_at timestamptz;

create index if not exists registrations_status_idx on public.registrations (status, status_at);

-- Participants keep reading their own row ("own registration: read"). Every
-- write (registering, freeing a spot, registering again) goes through the
-- server with the secret key, so nobody can give themselves a spot or move
-- themselves off the waitlist.
drop policy if exists "own registration: create" on public.registrations;
drop policy if exists "own registration: update" on public.registrations;

-- Give one person a spot if there is room and nobody is waiting before them;
-- otherwise the end of the waitlist. One decision at a time (an advisory
-- lock), so two people never both take the last spot. A new row waits as
-- 'waitlist' with no status_at until this runs, and such rows do not count
-- as waiting. Only the server (secret key) calls it.
create or replace function public.rsvp_seat(p_user uuid, p_capacity integer)
returns text
language plpgsql
set search_path = public
as $$
declare
  going_n integer;
  waiting_n integer;
  next_status text;
begin
  perform pg_advisory_xact_lock(hashtext('public.registrations:rsvp_seat'));
  select count(*) filter (where r.status = 'going'),
         count(*) filter (where r.status = 'waitlist' and r.status_at is not null)
    into going_n, waiting_n
    from public.registrations r
    where r.user_id <> p_user;
  next_status := case
    when p_capacity is null or (going_n < p_capacity and waiting_n = 0) then 'going'
    else 'waitlist'
  end;
  update public.registrations
    set status = next_status, status_at = now()
    where user_id = p_user;
  if not found then
    raise exception 'No such registration.' using errcode = 'P0002';
  end if;
  return next_status;
end;
$$;

revoke all on function public.rsvp_seat(uuid, integer) from public, anon, authenticated;
grant execute on function public.rsvp_seat(uuid, integer) to service_role;

-- Sponsor credits are for people with a spot: the same claim as before, now
-- refused for someone on the waitlist or who freed their spot.
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
  if not exists (select 1 from public.registrations r where r.user_id = uid and r.status = 'going') then
    raise exception 'Sponsor credits are for people with a spot.' using errcode = 'P0001';
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
