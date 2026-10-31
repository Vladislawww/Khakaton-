-- Lumora demo: mock customer data for the support-agent demo.
-- Every user-facing read and write goes through RLS with the signed-in parent's own session,
-- matching the "toolkit acts with the user's own token" rule in hackathon-context.md.

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text not null,
  phone       text,
  timezone    text not null default 'America/New_York',
  created_at  timestamptz not null default now()
);

create table public.children (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references public.profiles (id) on delete cascade,
  first_name  text not null,
  grade       text not null,               -- 'K', '1' … '12'
  subjects    text[] not null default '{math}'
);

create table public.tutors (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  subject     text not null check (subject in ('math', 'reading')),
  rating      numeric(2,1) not null,
  bio         text
);

create table public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  parent_id           uuid not null unique references public.profiles (id) on delete cascade,
  plan                text not null check (plan in ('3m', '6m', '12m')),
  subject_mode        text not null default 'one' check (subject_mode in ('one', 'both')),
  price_per_lesson    numeric(6,2) not null,
  discount_pct        int not null default 0 check (discount_pct between 0 and 50),
  status              text not null check (status in ('active', 'paused', 'cancel_requested', 'cancelled', 'past_due')),
  lessons_per_week    int not null default 2,
  lessons_remaining   int not null default 0,
  current_period_end  date not null,
  paused_until        date,
  cancel_reason       text,
  updated_at          timestamptz not null default now()
);

create table public.lessons (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references public.children (id) on delete cascade,
  tutor_id      uuid not null references public.tutors (id),
  subject       text not null check (subject in ('math', 'reading')),
  starts_at     timestamptz not null,
  duration_min  int not null default 50,
  status        text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'missed')),
  tutor_note    text
);

create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references public.profiles (id) on delete cascade,
  amount      numeric(8,2) not null,
  status      text not null check (status in ('paid', 'failed', 'refunded')),
  method      text not null,                -- e.g. 'Visa •••• 4242' (fake)
  created_at  timestamptz not null default now(),
  failure_reason text
);

-- Leads from the public "Book a free lesson" form (no login needed).
create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  grade       text not null,
  subject     text not null,
  email       text,
  source_page text,
  created_at  timestamptz not null default now()
);

-- Audit trail of every toolkit action, so the support team (and the demo) can see what changed.
create table public.action_log (
  id          bigint generated always as identity primary key,
  parent_id   uuid not null references public.profiles (id) on delete cascade,
  action      text not null,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index on public.children (parent_id);
create index on public.lessons (child_id, starts_at);
create index on public.payments (parent_id, created_at desc);
create index on public.action_log (parent_id, created_at desc);

-- ---------- Row level security ----------

alter table public.profiles      enable row level security;
alter table public.children      enable row level security;
alter table public.tutors        enable row level security;
alter table public.subscriptions enable row level security;
alter table public.lessons       enable row level security;
alter table public.payments      enable row level security;
alter table public.leads         enable row level security;
alter table public.action_log    enable row level security;

create policy "own profile"       on public.profiles      for select to authenticated using (id = auth.uid());
create policy "edit own profile"  on public.profiles      for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own children"      on public.children      for select to authenticated using (parent_id = auth.uid());
create policy "tutors are public" on public.tutors        for select to anon, authenticated using (true);
create policy "own subscription"  on public.subscriptions for select to authenticated using (parent_id = auth.uid());
create policy "own lessons"       on public.lessons       for select to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and c.parent_id = auth.uid()));
create policy "own payments"      on public.payments      for select to authenticated using (parent_id = auth.uid());
create policy "own action log"    on public.action_log    for select to authenticated using (parent_id = auth.uid());
create policy "anyone can leave a lead" on public.leads   for insert to anon, authenticated
  with check (char_length(grade) <= 4 and char_length(subject) <= 20 and coalesce(char_length(email), 0) <= 200);

-- Parents may only edit harmless profile columns directly; everything else goes through the functions below.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, timezone) on public.profiles to authenticated;

-- ---------- Toolkit actions (callable with the parent's own session via supabase.rpc) ----------
-- Each one checks ownership itself, so it can't act on another parent's data, and writes to action_log.

create or replace function public.pause_subscription(weeks int)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare s public.subscriptions;
begin
  if weeks not between 1 and 12 then raise exception 'Pause must be 1–12 weeks'; end if;
  update subscriptions set status = 'paused', paused_until = current_date + weeks * 7, updated_at = now()
   where parent_id = auth.uid() and status = 'active' returning * into s;
  if s.id is null then raise exception 'No active subscription to pause'; end if;
  insert into action_log (parent_id, action, details) values (auth.uid(), 'pause_subscription', jsonb_build_object('weeks', weeks));
  return s;
end $$;

create or replace function public.resume_subscription()
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare s public.subscriptions;
begin
  update subscriptions set status = 'active', paused_until = null, cancel_reason = null, updated_at = now()
   where parent_id = auth.uid() and status in ('paused', 'cancel_requested') returning * into s;
  if s.id is null then raise exception 'Nothing to resume'; end if;
  insert into action_log (parent_id, action) values (auth.uid(), 'resume_subscription');
  return s;
end $$;

create or replace function public.request_cancellation(reason text)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare s public.subscriptions;
begin
  update subscriptions set status = 'cancel_requested', cancel_reason = left(reason, 500), updated_at = now()
   where parent_id = auth.uid() and status in ('active', 'paused', 'past_due') returning * into s;
  if s.id is null then raise exception 'No subscription to cancel'; end if;
  insert into action_log (parent_id, action, details) values (auth.uid(), 'request_cancellation', jsonb_build_object('reason', left(reason, 500)));
  return s;
end $$;

-- Retention offer: the agent proposes it, the parent clicks "Stay", this applies it.
create or replace function public.accept_retention_offer(pct int)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare s public.subscriptions;
begin
  if pct not in (10, 20, 30) then raise exception 'Unknown offer'; end if;
  update subscriptions set status = 'active', discount_pct = pct, cancel_reason = null, updated_at = now()
   where parent_id = auth.uid() and status in ('active', 'cancel_requested') returning * into s;
  if s.id is null then raise exception 'No subscription for this offer'; end if;
  insert into action_log (parent_id, action, details) values (auth.uid(), 'accept_retention_offer', jsonb_build_object('discount_pct', pct));
  return s;
end $$;

create or replace function public.reschedule_lesson(lesson_id uuid, new_start timestamptz)
returns public.lessons language plpgsql security definer set search_path = public as $$
declare l public.lessons;
begin
  if new_start < now() + interval '24 hours' then raise exception 'New time must be at least 24 hours from now'; end if;
  update lessons set starts_at = new_start
   where id = lesson_id and status = 'scheduled' and starts_at > now() + interval '24 hours'
     and child_id in (select id from children where parent_id = auth.uid())
  returning * into l;
  if l.id is null then raise exception 'Lesson not found or too close to start time'; end if;
  insert into action_log (parent_id, action, details) values (auth.uid(), 'reschedule_lesson', jsonb_build_object('lesson_id', lesson_id, 'new_start', new_start));
  return l;
end $$;

create or replace function public.cancel_lesson(lesson_id uuid)
returns public.lessons language plpgsql security definer set search_path = public as $$
declare l public.lessons;
begin
  update lessons set status = 'cancelled'
   where id = lesson_id and status = 'scheduled' and starts_at > now()
     and child_id in (select id from children where parent_id = auth.uid())
  returning * into l;
  if l.id is null then raise exception 'Lesson not found or already started'; end if;
  insert into action_log (parent_id, action, details) values (auth.uid(), 'cancel_lesson', jsonb_build_object('lesson_id', lesson_id));
  return l;
end $$;

-- Demo only: puts a failed card "back in order" so the past-due persona can be recovered on stage.
create or replace function public.retry_payment()
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare s public.subscriptions;
begin
  update subscriptions set status = 'active', updated_at = now()
   where parent_id = auth.uid() and status = 'past_due' returning * into s;
  if s.id is null then raise exception 'No failed payment to retry'; end if;
  insert into payments (parent_id, amount, status, method)
    select auth.uid(), s.price_per_lesson * s.lessons_per_week * 4, 'paid', 'Visa •••• 4242';
  insert into action_log (parent_id, action) values (auth.uid(), 'retry_payment');
  return s;
end $$;

revoke execute on function public.pause_subscription(int), public.resume_subscription(), public.request_cancellation(text),
  public.accept_retention_offer(int), public.reschedule_lesson(uuid, timestamptz), public.cancel_lesson(uuid), public.retry_payment()
  from public, anon;
grant execute on function public.pause_subscription(int), public.resume_subscription(), public.request_cancellation(text),
  public.accept_retention_offer(int), public.reschedule_lesson(uuid, timestamptz), public.cancel_lesson(uuid), public.retry_payment()
  to authenticated;
