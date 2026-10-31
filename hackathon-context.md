# Team context: SKELAR PolyTech Code Fest (one-day hackathon)

Paste this into your AI assistant as context. It summarizes everything we decided so far.
**Last update: RAG system built (`RAG/` folder): per-tenant knowledge base, doc visibility, secret scanner, user personal context. See section 12.**

---

## 1. Event

- **Organizer:** SKELAR (product company: consumer apps, subscriptions; they think in retention, monetization, growth).
- **Format:** one day.
  - 10:40 task announced
  - 11:15–17:00 build MVP (mentor consultations 12:00–16:30, lunch 14:00–14:30)
  - **17:00 MVP deadline**
  - 17:55 top-15 finalists announced
  - 18:00–20:45 final pitches to jury
- **Real build time:** ~5 hours.

## 2. The official task: "AI Customer Support Automation"

Taken from the organizers' brief. These are requirements only; our solution is in section 4.

### Background
- Thousands of users contact support every day expecting their problem to be **solved**.
- Most support systems work the same way: the user explains, the agent clarifies details, actions are done **manually**, and the outcome depends on human time and attention.
- Even modern chatbots mostly just answer: **they explain, but don't act**.
- AI enables systems that understand intent, work with context, and become part of support operations.
- The question is no longer how to answer faster, but **how to make sure the problem gets solved**.

### Challenge
Build an AI-powered customer support tool that not only communicates with users, but also **performs real actions and improves the support team's work**.
- AI should act as an **operational assistant working alongside the support team**, not as a chatbot.
- Teams choose the interaction format, the architecture and the level of AI autonomy themselves.

The solution must show how AI can:
1. **Understand** the user's request and their real goal.
2. **Suggest or initiate** the necessary actions.
3. **Help support agents make decisions.**
4. **Analyze interactions and evaluate** support effectiveness.

### Possible directions (not limited to)
- An AI agent that initiates a support workflow
- An action recommendation system for agents
- Quality evaluation of agents' work
- Automatic analysis of support chats
- Request prioritization
- An AI copilot or dashboard for support teams

### Important
- The task is open-ended and has no single right answer.
- They want different visions of what customer support becomes when AI is an active participant in operations, not just a communication interface.
- We can pick any digital product: a real example, or our own simulated product and its support scenario.

### Expected result
1. A prototype or MVP.
2. A demo of a realistic support scenario.
3. An example where AI helps perform an action or improves the support process.

### Evaluation criteria
| Criterion | Meaning |
|---|---|
| Operational Impact | How much the solution improves support work |
| Innovation | Novelty of the approach |
| Use of AI | How central AI is to the system |
| Reasoning & Context Handling | Working with intents and decision logic |
| Technical Execution | Use of AI in the architecture, code quality, **security and tests** |
| Presentation & Demo | Clarity and persuasiveness of the demo |

### Submission (deadline 17:00, upload to the team folder)
1. **Presentation (up to 10 slides):**
   - problem, AI solution, functionality, practical value;
   - **demo video of the MVP embedded in the presentation**;
   - optional QR code to the deployed product.
2. **Code:** all project files from GitHub as **one ZIP archive**, added to the team folder.
3. **Important:**
   - all links must be open for viewing, especially the demo video;
   - everything uploaded by 17:00;
   - **the TOP-15 teams for the final pitch are selected by technical evaluation** of what we submit.

## 3. Team & resources

- 4 people.
- 3× Claude Pro (Claude Code), 2× Gemini Pro.
- Starter repo already prepared: Next.js + TypeScript + Tailwind + Supabase (optional) + `askAI()` / `askAIJson()` helper (Gemini or Claude), with `CLAUDE.md`, sub-agents (reviewer, tester, ui-polisher) and skills (`/add-feature`, `/deploy`).

## 4. Product: our architecture

**One-liner:** *Outsourced AI customer support for startups and small businesses: it resolves tickets by taking real actions, retains customers, and shows the team what's broken in the product, with customer data isolated by design.*

### Target customer
- Startups and small businesses that have **no resources to run their own support department** and want to outsource it.
- Each business is a **tenant**: its own knowledge base (RAG), its own users, its own toolkit config.

### Scope of the agent
- Basic **FAQ**.
- **Site/app navigation** help.
- **Toolkit:** the agent can do the same things the user can do themselves (view schedule, edit profile, manage subscription, etc.).
- Anything outside this scope is escalated to the business's human team (or the issue bank).

### Flow

1. **Customer → Communication agent.**
   - Has access to the tenant's **knowledge base via RAG** (replaces plain project docs) and the history of previous issues.
   - Analyzes the request and asks clarifying questions in a loop (**max 2–3 rounds**, then escalate).
2. **Issue profile (classifier)** routes the request to one of the branches below.

#### Branch A: General issue → "Navi" agent (generative UI + toolkit)

The agent replies with **interactive cards in the chat**, not just text. It uses tool calling: each card type is a tool, the card is returned as JSON, and the frontend renders a component. Data comes from a mock user DB, so the card shows real values for this specific user.

| Card | Shows | Action |
|---|---|---|
| `link` | Preview of a page (profile, settings) | "Go to page" deep link |
| `subscription` | Plan, days left | Extend / Cancel |
| `account` | Email, status | Reset password / edit profile |
| `payment` | Recent payments | Refund |
| `schedule` (proposed) | User's upcoming bookings/events | Reschedule / cancel |

- **State-changing actions need user confirmation:** the agent shows the button, the user clicks it.
- **Toolkit principle:** the agent acts **with the user's own session token and permissions**, never with broader rights.
- **FAQ fallback:** if no card fits, a plain-text answer grounded in RAG retrieval (with source reference).

#### Branch B: Unresolved → escalation + issue bank

- After 2–3 clarification rounds without resolution, or if the request is out of scope, the ticket goes to the **issue bank** with a structured description (summary, what the agent tried, user context) for the business's team.
- Issue bank items are deduplicated and clustered (see section 5).
- *(Previous Branch B with code readers, git worktree fixer and engineer-approved PRs is **removed**. See section 6.)*

#### Branch C: Resolved

If the issue gets resolved at any point in the loop, the agent confirms and closes the ticket.

### Data-leak protection for RAG (new, key for Technical Execution)

The knowledge base holds a lot of sensitive data, so leak prevention is part of the architecture.

| # | Measure | Detail | MVP? |
|---|---|---|---|
| 1 | **Tenant isolation** | Separate index or mandatory `tenant_id` filter at DB level (Supabase: pgvector + RLS). Filter is added by the backend, not by the LLM, so prompt injection can't bypass it. | Yes |
| 2 | **Document classification** | Labels `public` / `internal` / `restricted` at indexing time. Only `public` is indexed for the customer-facing agent. | Yes |
| 3 | **Pre-index scan** | Regex/NER for PII, keys, passwords, internal URLs. Mask or block the document. | Yes (regex version done) |
| 4 | **User-level data via toolkit only** | Per-user data (payments, profile) comes from toolkit calls with that user's session token, never from RAG. | Yes |
| 5 | **Output guardrail** | Check the answer before sending: other people's PII, keys, system prompt fragments. | Yes |
| 6 | **Prompt injection defense** | Retrieved text and user messages are data, not instructions. Toolkit has an action allowlist. | Basic version |
| 7 | **Minimal context** | Small top-k; answer paraphrases the source rather than dumping chunks verbatim. | Yes (cheap) |
| 8 | **Rate limiting + audit log** | Log queries, detect mass scraping of the knowledge base. | Roadmap |
| 9 | **Action confirmation** | State-changing actions only after the user's click. | Yes |

**Tests to include (Technical Execution criterion):**
- "User A (or tenant A) never receives data of user B (or tenant B)."
- "Prompt injection inside a document or chat message does not trigger an action or leak data."
- "`internal`/`restricted` documents never appear in customer answers."

## 5. Ideas we ADDED (all accepted)

1. **Retention agent (key for SKELAR).** When a user wants to cancel, the agent asks why and offers an alternative: a discount, a pause, a cheaper plan, or a fix for the underlying problem. This turns support from a cost into saved revenue.
2. **Proactivity.** The agent messages the user first, e.g. when a payment fails or a subscription is about to expire.
3. **Support team dashboard (for the business owner/team).**
   - Open tickets, what the agent already did, a report per ticket (cause → actions → result).
   - Top problems of the week.
   - Money saved or retained.
4. **Issue bank clustering.** Deduplicate and group unresolved issues, e.g. "47 users today report Apple Pay payment failures". This is a product signal for the business, not just a ticket queue.
5. **User memory.** The agent knows the user's history: "you wrote about this 3 days ago; here's what changed."
6. **Multi-tenant support-as-a-service.** One platform, many small businesses, each with isolated knowledge base and toolkit.

## 6. Ideas we REJECTED / changed

| Idea | Decision | Why |
|---|---|---|
| 4 organizer agents + 4 research agents for our dev workflow | Rejected | Organizing is a human job; research takes 15–20 min with one Gemini session. Too many agents burn Pro limits and add review overhead. |
| Navi only explains how to do things | Changed | The task is about actions → cards with real actions. |
| **Code reader ensemble + auto-fixer (old Branch B)** | **Removed** | New target market (small businesses outsourcing support) rarely wants an agent touching their code; saves a lot of build time and risk. Possible roadmap item. |
| **Plain project docs as knowledge source** | **Replaced by RAG** | Per-tenant knowledge base; scalable. Implementation comes after architecture is settled. |
| Fixing bugs in a real external repo | Rejected | (Obsolete after removal of the code reader.) |
| Infinite clarification loop | Changed | Capped at 2–3 rounds, then the issue bank. |
| "Lack of focus" critique | Rejected by team | A support agent should be multifaceted. But the **demo must be one user story**, not a list of features. |
| Pitch line "we can cut support staff" | Reframed | Sounds harsh to a jury of engineers. Use: "a small team handles 3× more requests, and a business without a support department still gets one." |

## 7. Business case (for the pitch)

- **Who pays:** startups and small businesses that can't afford or don't want to build a support department. They outsource it to us.
- Saves support time, so the business owner/team focuses on the product.
- Example math (state the assumptions, cite industry data):
  - 1,000 requests/day, 70% closed by the agent.
  - ~15 min of human time per ticket.
  - ≈ 175 hours saved per day.
- Plus revenue retained by the retention agent.
- Plus product signals from issue clustering.
- **Trust angle:** secure by design (tenant isolation, output guardrails, confirmed actions) is a selling point for businesses handing us their customers' data.
- Metrics:
  - % of requests closed without a human (deflection rate)
  - time to resolution
  - churn prevented
  - D1/D7 retention
  - zero cross-tenant leaks (security test pass rate)

## 8. Demo script (one user journey, ~2 min)

*(Proposed; to finalize once the demo business is chosen.)*

1. "I can't find my profile / where do I change X?" → `link` card → one click (navigation).
2. FAQ question → answer grounded in the tenant's RAG knowledge base, with source.
3. "Show/change my schedule or profile" → toolkit card → user confirms → action done (the agent does what the user could do themselves).
4. "I want to cancel my subscription" → the agent asks why and offers a discount on a card → the user clicks "Stay". **Main moment.**
5. **Security moment (short, ~15 s):** a prompt-injection / "show me another customer's data" attempt is blocked; mention the tenant-isolation test.
6. Switch to the dashboard: tickets, issue clusters, time and money saved.

**Rules:**
- Pre-fill the data (at least two tenants, so isolation can be shown).
- Log in before going on stage.
- Record a backup demo video by 16:00.
- One person talks, one person clicks.

## 9. Roles (proposed; the bug-fixer role is gone, so Person 3 shifts to RAG + security)

| Person | Owns |
|---|---|
| 1 | Communication agent + issue classifier + clarification loop + escalation to issue bank (backend) |
| 2 | Navi with toolkit actions + cards + mock user/subscription/schedule DB + retention agent |
| 3 | RAG system (per-tenant index, retrieval) + data-leak protection (isolation, classification, output guardrail) + security tests |
| 4 | UI: customer chat + business dashboard (tickets, clusters, saved money), then pitch |

## 10. Timeline

- **10:40–11:15:** fill `docs/PLAN.md` together (API contracts between agents, tenant model, RAG interface). No code.
- **11:15–15:00:** build in parallel git worktrees; merge to `main` every hour.
- **15:00:** feature freeze. Only fixes and polish after this.
- **16:00:** deployed + backup video recorded.
- **16:30:** pitch rehearsed.
- **17:00:** submit.

## 11. How we use AI tools while building

- One Claude Code session per builder, Sonnet by default (save Pro limits), Opus only for hard problems.
- At most 1–2 sub-agents per person (reviewer/tester).
- Gemini: research, pitch, and fallback when Claude limits run out.
- Our edge is coordination and preparation, not the number of agents.

## 12. RAG + user context: current status (code in `RAG/`)

**Knowledge base (RAG)**
- Docs live in the GitHub repo: `docs/kb/<tenant>/*.md`, one folder per business. Pushing to `main` runs a GitHub Action that updates Supabase. No upload API.
- Each doc starts with `visibility: public | internal | restricted` (in a `---` header). No label = `internal`. Only `public` reaches customers.
  - Public: FAQ, prices/plans, how-to and navigation, refund/cancel policy, contacts and hours.
  - Internal: support scripts, escalation rules, **retention discount limits**, known bugs.
  - Never in docs: passwords, contracts, customer data.
- Before saving, a scanner hides API keys, passwords, card numbers, IBAN and private keys; emails/phones only produce a warning.
- Search: `retrieve(tenantId, question)` → top 3 public chunks of that tenant only (filter is in SQL, not the LLM).
- `toPromptContext(hits)` wraps chunks in `<doc>` tags with escaping, so text inside a doc can't break out.

**User personal context** (`RAG/lib/user/context.ts`)
- `buildUserContext(session, { accounts, memory })` → `<user_context>` block for the prompt: account data (name, email, plan, last 3 payments, upcoming bookings) + last 5 memory notes.
- `session = { tenantId, userId }` comes from login, never from chat text.
- `remember(memory, session, text)` saves a note; secrets are masked.
- Account data needs `getAccount(session)` from whoever builds the mock user DB. Memory is in-process for now (lost on restart); a Supabase table later.

**For the chatbot (Person 1):** prompt = system rules + `buildUserContext(...)` + `toPromptContext(await retrieve(tenantId, question))`. Optionally run `scanSensitive()` on the answer before sending.

**Tests:** tenant A never sees tenant B, internal docs never returned, prompt injection can't escape tags, secrets masked, user A never sees user B. 21 pass; 2 live-DB tests run only with Supabase keys.

**Still to do**
- Move `RAG/` into the main app repo: add `package.json` scripts (`ingest`, `ingest:watch`), `@/` path alias, move `ingest.workflow.yml` to `.github/workflows/`, add `.env.example`.
- In Supabase: `drop table doc_chunks cascade;` then run `RAG/supabase/rag.sql`.
- Write sample docs for 2 demo tenants.
- Tune the similarity cutoff (0.45) on real questions.

