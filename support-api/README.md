# Lumora support API (mock)

REST endpoints the support agent calls as tools. All data is fake and lives in memory: it's rebuilt from `seed.js` on every start (and on `POST /api/admin/reset`), with lesson times relative to "now".

- **Live:** https://lumora-api-lm0d.onrender.com (free Render instance: the first request after ~15 idle minutes takes up to a minute to wake it, and waking also resets the data)
- **Local:** `node server.js` (port 3000, or `PORT=...`). Tests: `node --test test.mjs`. Node 20+, no dependencies.

> This is a separate store from the website's Supabase database. The families have the same names so the story matches, but changes made here don't show on the website dashboard.

## Conventions

- Every response is `{ "ok": bool, "data": {...} | null, "error": { "code": str, "message": str } | null }`.
- Times are ISO 8601 in UTC.
- Send `X-Caller: <who>` (e.g. `agent:navi`, `human:olena`) so the audit log shows who did what. Defaults to `anonymous`.
- **Write endpoints need a verified account.** Otherwise they return `IDENTITY_NOT_VERIFIED`. Verify with `POST /api/accounts/{id}/verify` first.
- On a failed call, `data` can still carry useful details (e.g. `alternatives` for `SLOT_UNAVAILABLE`, `preview` for `APPROVAL_REQUIRED`).

## Tools

| # | Tool | Endpoint | Risk |
|---|---|---|---|
| 1 | get_account | `GET /api/accounts/{account_id}` | read |
| 2 | get_lessons | `GET /api/accounts/{account_id}/lessons?child_id=&status=&from=&to=` | read |
| 3 | reschedule_lesson | `POST /api/lessons/{lesson_id}/reschedule` | write, medium |
| 4 | assign_tutor | `POST /api/accounts/{account_id}/assign_tutor` | write, medium |
| 5 | cancel_subscription | `POST /api/accounts/{account_id}/subscription/cancel` | write, **high: human approval** |

Supporting endpoints: `POST /api/accounts/{id}/verify`, `GET /api/audit_log?account_id=&tool=&limit=`, `POST /api/admin/reset`, `GET /api/health`.

### 1. get_account
Returns `account_id, parent_name, email, preferred_language, verified, children[{id, name, grade}], subscription{plan, status, price{amount, currency, interval}, next_billing_date}`.
Errors: `ACCOUNT_NOT_FOUND`.

### 2. get_lessons
Returns `{ count, lessons[] }`, sorted by start. Each lesson has `lesson_id, child_id, tutor{id, name}, start, duration_min, status, topic`; completed ones also have `tutor_note` and `progress_rating` (1–5).
Filters: `child_id`, `status` (`scheduled | completed | cancelled | missed`), `from` / `to` (ISO, inclusive).
Errors: `ACCOUNT_NOT_FOUND`, `INVALID_DATE_RANGE` (bad date or `from` > `to`), `CHILD_NOT_FOUND`, `INVALID_REQUEST` (bad status).

### 3. reschedule_lesson
Body: `{ "new_start": "2026-11-05T16:00:00Z", "reason": "Football practice" }`
Moves a scheduled lesson if the tutor (and child) are free and the time is inside the tutor's working hours.
- `TOO_LATE`: the lesson itself starts in less than 24 hours.
- `NOT_RESCHEDULABLE`: the lesson isn't `scheduled`.
- `SLOT_UNAVAILABLE`: the new time is taken, outside working hours, or less than 24 hours away. `data.alternatives` lists up to 3 free start times nearest to the request (empty if the tutor is fully booked; then suggest `assign_tutor`).
- `LESSON_NOT_FOUND`, `IDENTITY_NOT_VERIFIED`, `INVALID_REQUEST`.
Success: `{ lesson, previous_start }`.

### 4. assign_tutor
Body: `{ "child_id": "ch_2001", "new_tutor_id": "tut_03", "reason": "Wants a calculus specialist" }`
Makes the tutor the child's regular tutor and moves every future scheduled lesson the new tutor can take at the same time. Lessons starting within 24 hours stay with the old tutor.
Success: `{ child_id, previous_tutor, new_tutor, moved_lessons[], not_moved_lessons[] }`; each not-moved lesson has a `reason` and, where possible, `suggested_slots`.
Errors: `TUTOR_NOT_FOUND`, `TUTOR_UNAVAILABLE` (no free slots in the next 14 days, or doesn't teach the child's subject), `CHILD_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `IDENTITY_NOT_VERIFIED`, `INVALID_REQUEST` (already that tutor).

### 5. cancel_subscription
Body: `{ "reason": "Too expensive", "effective": "end_of_period" | "immediately", "approved_by": null | "human:olena" }`
- `end_of_period`: status becomes `cancellation_scheduled`, effective on the next billing date, refund 0.
- `immediately`: refunds the unused share of the current paid period (by days; 0 if past due). **Rejected with `APPROVAL_REQUIRED` unless `approved_by` is set.** The rejection includes `data.preview { effective_date, refund_amount, currency }` for the human to approve. On success the status is `cancelled` and future lessons are cancelled.
Success: `{ account_id, status, effective_date, refund_amount, currency, ... }`.
Errors: `ALREADY_CANCELLED` (also when an end-of-period cancellation is already scheduled), `APPROVAL_REQUIRED`, `ACCOUNT_NOT_FOUND`, `IDENTITY_NOT_VERIFIED`, `INVALID_REQUEST`.

### verify (supporting)
Body: `{ "email": "...", "child_name": "..." }`. If both match the account (case-insensitive), it's marked `verified: true`. Otherwise `VERIFICATION_FAILED`.

### Audit log
`GET /api/audit_log` returns `{ count, entries[] }`, newest first. Each entry has `{ id, timestamp, tool, args, caller, result }`, where `result` is the full response envelope. Filters: `tool`, `account_id`, `limit` (default 100). It's kept in memory (last 2,000 calls) and resets with the data.

HTTP status codes: 200 on success; 400 `INVALID_*`; 403 `IDENTITY_NOT_VERIFIED`, `APPROVAL_REQUIRED`, `VERIFICATION_FAILED`; 404 `*_NOT_FOUND`; 409 `TOO_LATE`, `NOT_RESCHEDULABLE`, `SLOT_UNAVAILABLE`, `TUTOR_UNAVAILABLE`, `ALREADY_CANCELLED`.

## Seed data

| Account | Parent (language) | Children | Subscription | Notes |
|---|---|---|---|---|
| `acc_1001` | Anna Kovalenko (uk) | Max, gr 4, math, Nia (`ch_2001`) | active, $184/mo | happy path |
| `acc_1002` | Ben Carter (en) | Sofia, gr 7, math, Leo (`ch_2002`) | active, $104/mo | **unverified**; tutor fully booked |
| `acc_1003` | Chloe Nguyen (es) | Lily, gr 1, reading, Ella (`ch_2003`) | past_due, $152/mo | lesson `les_3201` starts in ~5 h |
| `acc_1004` | David Okafor (en) | Ada, gr 5, math, Nia (`ch_2004`); Sam, gr 2, reading, Samuel (`ch_2005`) | active, $252/mo | two children |
| `acc_1005` | Emma Rossi (it) | Luca, gr 3, math (`ch_2006`) | **cancelled** | |

Tutors: `tut_01` Nia Okoro (math), `tut_02` Leo Brandt (math, **no free slots**), `tut_03` Priya Venkat (math), `tut_04` Ella Hart (reading), `tut_05` Samuel Adeyemi (reading). Working hours are weekday afternoons and Saturday mornings in UTC (see `seed.js`).

### Ready-made scenarios

| Try | Expect |
|---|---|
| reschedule `les_3201` | `TOO_LATE` |
| reschedule `les_3002` to the start time of `les_3104` | `SLOT_UNAVAILABLE` + 3 alternatives |
| reschedule `les_3002` to one of those alternatives | success |
| reschedule `les_3102` before verifying `acc_1002` | `IDENTITY_NOT_VERIFIED` |
| verify `acc_1002` (`ben.carter@example.com`, `Sofia`), then reschedule `les_3102` | `SLOT_UNAVAILABLE`, no alternatives (Leo is full) |
| assign `ch_2002` → `tut_02` | `TUTOR_UNAVAILABLE` |
| assign `ch_2002` → `tut_03` (after verifying) | moved / not-moved lessons |
| cancel `acc_1005` | `ALREADY_CANCELLED` |
| cancel `acc_1001` immediately, no approver | `APPROVAL_REQUIRED` + refund preview |
| same with `approved_by` | `cancelled` + refund |

```bash
curl -s https://lumora-api-lm0d.onrender.com/api/accounts/acc_1001
curl -s -X POST https://lumora-api-lm0d.onrender.com/api/lessons/les_3201/reschedule \
  -H "Content-Type: application/json" -H "X-Caller: agent:navi" \
  -d '{"new_start":"2026-11-10T16:00:00Z","reason":"Doctor visit"}'
curl -s https://lumora-api-lm0d.onrender.com/api/audit_log?limit=5
```
