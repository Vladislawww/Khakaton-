-- Reschedule rule: a lesson can be moved only if it starts more than 24 hours from now,
-- to a new time at least 24 hours away (same as the agent and the support API).
-- 001 already has this for new databases; run this on databases created with the old 4-hour rule.
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
