-- Lumora demo seed: 4 test parents, one per demo-script scenario. All people are fictional.
-- Test logins (same password for all, demo use only): see the password literal in crypt() below.
--
--   anna.kovalenko@example.com  happy path: active 6-month plan, lessons to view / reschedule
--   ben.carter@example.com      retention: wants to cancel, few lessons left, period ends soon
--   chloe.nguyen@example.com    proactive: card declined yesterday, subscription past due
--   david.okafor@example.com    two children, subscription paused
--
-- Lesson dates are relative to now(), so the schedule is always "upcoming" when you re-seed.

-- ---------- Tutors ----------
insert into public.tutors (id, full_name, subject, rating, bio) values
  ('10000000-0000-0000-0000-000000000001', 'Nia Okoro',        'math',    4.9, 'Elementary math, 7 years. Loves fraction games.'),
  ('10000000-0000-0000-0000-000000000002', 'Leo Brandt',       'math',    4.8, 'Middle-school math and pre-algebra.'),
  ('10000000-0000-0000-0000-000000000003', 'Priya Venkat',     'math',    5.0, 'High-school algebra through calculus.'),
  ('10000000-0000-0000-0000-000000000004', 'Ella Hart',        'reading', 4.9, 'Phonics and early readers, K–2.'),
  ('10000000-0000-0000-0000-000000000005', 'Samuel Adeyemi',   'reading', 4.8, 'Comprehension and writing, grades 3–6.');

-- ---------- Auth users (email + password, already confirmed) ----------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, email_change, email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('Lumora-pLGDRa3x-demo', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.name), now(), now(), '', '', '', ''
from (values
  ('20000000-0000-0000-0000-000000000001'::uuid, 'anna.kovalenko@example.com', 'Anna Kovalenko'),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'ben.carter@example.com',     'Ben Carter'),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'chloe.nguyen@example.com',   'Chloe Nguyen'),
  ('20000000-0000-0000-0000-000000000004'::uuid, 'david.okafor@example.com',   'David Okafor')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u where u.email like '%@example.com';

-- ---------- Profiles and children ----------
insert into public.profiles (id, full_name, email, phone, timezone) values
  ('20000000-0000-0000-0000-000000000001', 'Anna Kovalenko', 'anna.kovalenko@example.com', '+1 555 0101', 'America/New_York'),
  ('20000000-0000-0000-0000-000000000002', 'Ben Carter',     'ben.carter@example.com',     '+1 555 0102', 'America/Chicago'),
  ('20000000-0000-0000-0000-000000000003', 'Chloe Nguyen',   'chloe.nguyen@example.com',   '+1 555 0103', 'America/Los_Angeles'),
  ('20000000-0000-0000-0000-000000000004', 'David Okafor',   'david.okafor@example.com',   '+1 555 0104', 'America/New_York');

insert into public.children (id, parent_id, first_name, grade, subjects) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Max',   '4', '{math}'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Sofia', '7', '{math}'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Lily',  '1', '{reading}'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 'Ada',   '5', '{math,reading}'),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000004', 'Sam',   '2', '{reading}');

-- ---------- Subscriptions ----------
insert into public.subscriptions (parent_id, plan, subject_mode, price_per_lesson, status, lessons_per_week, lessons_remaining, current_period_end, paused_until) values
  ('20000000-0000-0000-0000-000000000001', '6m',  'one',  23.00, 'active',   2, 14, current_date + 21, null),
  ('20000000-0000-0000-0000-000000000002', '3m',  'one',  26.00, 'active',   1,  3, current_date + 9,  null),
  ('20000000-0000-0000-0000-000000000003', '12m', 'one',  19.00, 'past_due', 2,  0, current_date - 1,  null),
  ('20000000-0000-0000-0000-000000000004', '6m',  'both', 21.00, 'paused',   3, 18, current_date + 40, current_date + 14);

-- ---------- Lessons (past + upcoming) ----------
insert into public.lessons (child_id, tutor_id, subject, starts_at, duration_min, status, tutor_note) values
  -- Anna / Max
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'math', date_trunc('hour', now()) - interval '5 days',  50, 'completed', 'Equivalent fractions: solid. Next: comparing fractions.'),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'math', date_trunc('hour', now()) - interval '2 days',  50, 'completed', 'Comparing fractions with pizza models. Great focus today.'),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'math', date_trunc('day', now()) + interval '2 days 17 hours', 50, 'scheduled', null),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'math', date_trunc('day', now()) + interval '4 days 17 hours', 50, 'scheduled', null),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'math', date_trunc('day', now()) + interval '9 days 17 hours', 50, 'scheduled', null),
  -- Ben / Sofia
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'math', date_trunc('hour', now()) - interval '6 days',  50, 'missed',    'Student did not join.'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'math', date_trunc('day', now()) + interval '3 days 16 hours', 50, 'scheduled', null),
  -- Chloe / Lily
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'reading', date_trunc('hour', now()) - interval '3 days', 30, 'completed', 'Short-vowel blends going well.'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'reading', date_trunc('day', now()) + interval '1 day 15 hours', 30, 'scheduled', null),
  -- David / Ada and Sam (paused, so only past lessons)
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'math',    date_trunc('hour', now()) - interval '10 days', 50, 'completed', 'Decimals review before the break.'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'reading', date_trunc('hour', now()) - interval '9 days',  50, 'completed', 'Read two chapters aloud with expression.');

-- ---------- Payments (fake card labels) ----------
insert into public.payments (parent_id, amount, status, method, created_at, failure_reason) values
  ('20000000-0000-0000-0000-000000000001', 184.00, 'paid',   'Visa •••• 4242',       now() - interval '9 days',  null),
  ('20000000-0000-0000-0000-000000000002', 104.00, 'paid',   'Mastercard •••• 4444', now() - interval '21 days', null),
  ('20000000-0000-0000-0000-000000000003', 152.00, 'paid',   'Visa •••• 1881',       now() - interval '31 days', null),
  ('20000000-0000-0000-0000-000000000003', 152.00, 'failed', 'Visa •••• 1881',       now() - interval '1 day',   'Card declined: insufficient funds'),
  ('20000000-0000-0000-0000-000000000004', 252.00, 'paid',   'Amex •••• 0005',       now() - interval '20 days', null);
