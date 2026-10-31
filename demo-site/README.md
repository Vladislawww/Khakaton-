# Lumora Learning: demo site

A fictional K-12 tutoring website that the support agent can "work for" in the hackathon demo.
Its layout and interaction patterns follow brighterly.com. The name, logo, copy, palette, fonts and illustrations are all original (see `capture/plan.md`).

## Run

No build step. Open `index.html` in a browser, or serve the folder:

```bash
npx serve demo-site
```

## Pages

| File | What it is |
|---|---|
| `index.html` | Landing page |
| `math-tutors.html`, `reading-tutors.html` | Subject landing pages |
| `grade-1-math.html` | Grade page template |
| `reviews.html` | Parent reviews |
| `pricing.html` | Plans (3 cards, subject toggle) |
| `about.html` | Company story |
| `help-center.html` | Searchable, categorised FAQ: useful as the agent's knowledge base |
| `worksheets.html` | Worksheet listing |
| `blog.html` | Blog listing with filter and pagination |
| `privacy.html` | Legal page with table of contents |

## Structure

- `css/styles.css`: design tokens (`:root`) and all components.
- `js/site.js`: injects the shared header and footer, plus menus, carousel, booking modal, filters and illustrations.
- Every section has a `data-section` name, so the agent or tests can target it.

## Accounts and data (Supabase)

- Project: `lumora-demo` (ref `ygriuepyedzfupejluwb`, Frankfurt, free tier). Its URL and public anon key are in `js/config.js`; that key is safe in the browser because every table uses row level security.
- Schema: `supabase/migrations/001_schema.sql`. Test data: `supabase/seed.sql`. Lesson dates are relative to the time you seed.
- Test parents (they all share the password stored in `seed.sql`):

| Email | Scenario |
|---|---|
| anna.kovalenko@example.com | Happy path: active plan, upcoming lessons to reschedule |
| ben.carter@example.com | Retention: wants to cancel, 3 lessons left |
| chloe.nguyen@example.com | Proactive: card declined, subscription past due |
| david.okafor@example.com | Two children, subscription paused |

- Toolkit for the agent: call these with the parent's own session via `supabase.rpc(...)`:
  `pause_subscription(weeks)`, `resume_subscription()`, `request_cancellation(reason)`, `accept_retention_offer(pct)`,
  `reschedule_lesson(lesson_id, new_start)`, `cancel_lesson(lesson_id)`, `retry_payment()`.
  Each one checks ownership and writes to `action_log`.
- Booking requests from the "Book a free lesson" form land in `leads`.

## Support-agent tool API

The five mock support tools (get_account, get_lessons, reschedule_lesson, assign_tutor, cancel_subscription) run as a separate REST service with its own in-memory data: see [`../support-api/README.md`](../support-api/README.md). Live at https://lumora-api-lm0d.onrender.com.

## Demo stubs

The video, tutor applications, article pages and worksheet downloads show a toast instead of opening anything.
"Chat with support" on the help center is where the AI support agent can plug in.
