# Demo site plan

**Lane: reference build.** brighterly.com belongs to another company and the team has no permission to copy it (user's answer, 2026-10-31). Only section order, grid, spacing rhythm and interaction ideas are borrowed. Name, logo, copy, images, palette and typefaces are our own.

**Purpose:** a fictional "client product" for the hackathon support-agent demo (see `hackathon-context.md`).

**Brand (invented):** Lumora Learning, a 1:1 online K-12 math and reading tutoring service.
- Palette: deep teal `#0f5c55` (primary), coral `#ff7a59` (accent), sunflower `#ffc94d`, cream `#fbf6ee` (surface), ink `#14211f`.
  The reference uses violet/purple and a dark purple footer, so ours does not.
- Type: Bricolage Grotesque (headings) and Nunito (body), from Google Fonts (OFL).
  The reference uses Inter, Mona Sans, Rubik and Roboto.
- Imagery: CSS/SVG shapes and initials avatars only. No photos, no third-party logos.

**Stack:** plain HTML, CSS and JS. No build step. The shared header and footer are injected by `js/site.js`, so pages also open from `file://`.

## Scope: one page per template (user's choice)

| Our page | Reference template | Pattern borrowed |
|---|---|---|
| `index.html` | home | hero with grade picker → audience cards (3) → awards row → 3-step features → video block → logo marquee → CTA banner → reviews slider → highlights (4) → grade bands (3) → promo banner → FAQ accordion → blog cards (3) → hiring banner |
| `math-tutors.html` | subject landing | hero → tutor cards → internal link chips → how-it-works steps (4) → highlights → grade bands → more services → learner types (3) → cost banner → reviews slider → nearby link chips → FAQ |
| `reading-tutors.html` | subject landing | same template as math, reading copy |
| `reviews.html` | reviews | hero with rating → rating gauges (3) → reviews slider → CTA → reasons (3) → student stories (modal) → compact banner → tutors → hiring |
| `pricing.html` | pricing | plan cards (3, middle highlighted, "save %") → CTA → highlights (3) → FAQ → booking form banner |
| `about.html` | about | image hero → press marquee → impact numbers (3) → timeline → mission (4) → quote → offerings → approach (4) → stories → blog → FAQ → hiring |
| `help-center.html` | help center | search hero → top article cards (4) → categorised FAQ (multi) → contact-support banner → related articles |
| `grade-1-math.html` | grade page | hero → tutors → "needs extra help?" checklist → curriculum topics → diagnostic test CTA → steps → why us → reviews → subject chips → worksheet links → FAQ |
| `worksheets.html` | worksheet listing | hero → by-grade grid (14) → by-topic grid (8) → email capture |
| `blog.html` | blog listing | hero → category filter → post grid → pagination → CTA |
| `privacy.html` | legal | title → sticky table of contents → numbered sections |

## Interactions borrowed
- Sticky header with a shadow after scrolling.
- Mega-menus on "Math tutors" and "Reading tutors" (hover or focus on desktop, accordion inside the mobile drawer).
- Hamburger drawer below 960px.
- Hero grade picker: choosing a grade opens the booking modal with that grade preset.
- Reviews carousel with prev/next buttons and scroll-snap.
- Logo marquee (paused when `prefers-reduced-motion` is set).
- FAQ accordions using `<details>`.
- Blog category filter and pagination; help-center live search over the FAQ.

## Left out
- Sign-in, account and real checkout pages. "Log in" and "Book a free lesson" open a demo modal, and nothing is sent anywhere.
- Analytics, cookie banner, chat widget, third-party embeds, and the ~110 other linked pages (grade, city and topic variants of the templates above).

## Acceptance (reference lane: no pixel diff against the source)
- Side-by-side check: name, logo, palette, typefaces, copy and imagery all differ from brighterly.com.
- Every page renders at 390, 768 and 1440 with no horizontal scroll and an empty console.
- No request to brighterly.com.
- Keyboard: menus, accordions, carousel and modal are all reachable, and focus is visible.
