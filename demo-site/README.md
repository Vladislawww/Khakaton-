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

## Demo stubs

"Book a free lesson" opens a modal that sends nothing. "Log in", the video, tutor applications, article pages and worksheet downloads show a toast instead.
"Chat with support" on the help center is where the AI support agent can plug in.
