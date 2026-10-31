# Team context: SKELAR PolyTech Code Fest (one-day hackathon)

Paste this into your AI assistant as context. It summarizes everything we decided so far.

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

**One-liner:** *An agent that doesn't just answer tickets: it closes them, retains customers, and shows the team what's broken in the product.*

### Flow

1. **Customer → Communication agent.**
   - Has access to project docs and the history of previous issues.
   - Analyzes the request and asks clarifying questions in a loop (**max 2–3 rounds**, then escalate).
2. **Issue profile (classifier)** routes the request to one of three branches.

#### Branch A: General issue → "Navi" agent (generative UI)

The agent replies with **interactive cards in the chat**, not just text. It uses tool calling: each card type is a tool, the card is returned as JSON, and the frontend renders a component. Data comes from a mock user DB, so the card shows real values for this specific user.

| Card | Shows | Action |
|---|---|---|
| `link` | Preview of a page (profile, settings) | "Go to page" deep link |
| `subscription` | Plan, days left | Extend / Cancel |
| `account` | Email, status | Reset password |
| `payment` | Recent payments | Refund |

- **State-changing actions need user confirmation:** the agent shows the button, the user clicks it.
- **Fallback:** if no card fits, a plain-text answer from the docs.

#### Branch B: Bug → ensemble of code readers

- Readers read the project code and try to locate the bug.
- **Found:** try to fix it on a **copy of the project** (git worktree; the fixer can be Claude Code in headless mode, `claude -p "..."`) → run tests → **engineer verifies** (diff + test results + Approve/Reject in the UI) → customer gets "fixed".
- **Not found:** go back to the customer with more questions (loop).
- **Still not found:** push to the **issue bank** with a structured description for engineers.
- Realistic flow to mention in the pitch: the agent prepares a PR, the engineer merges it, and the customer is notified after release. No auto-deploy to production.

#### Branch C: Resolved

If the issue gets resolved at any point in the loop, the agent confirms and closes the ticket.

## 5. Ideas we ADDED (all accepted)

1. **Retention agent (key for SKELAR).** When a user wants to cancel, the agent asks why and offers an alternative: a discount, a pause, a cheaper plan, or a fix for the underlying problem. This turns support from a cost into saved revenue.
2. **Proactivity.** The agent messages the user first, e.g. when a payment fails or a subscription is about to expire.
3. **Support team dashboard.**
   - Open tickets, what the agent already did, a report per ticket (cause → actions → result).
   - Top problems of the week.
   - Money saved or retained.
4. **Issue bank clustering.** Deduplicate and group issues, e.g. "47 users today report Apple Pay payment failures". This is a product signal, not just a ticket queue.
5. **User memory.** The agent knows the user's history: "you wrote about this 3 days ago; here's what changed."

## 6. Ideas we REJECTED / changed

| Idea | Decision | Why |
|---|---|---|
| 4 organizer agents + 4 research agents for our dev workflow | Rejected | Organizing is a human job; research takes 15–20 min with one Gemini session. Too many agents burn Pro limits and add review overhead. |
| Navi only explains how to do things | Changed | The task is about actions → cards with real actions. |
| Full 3-reader ensemble at all times | Simplified | 3× tokens and time. MVP: 1 reader + 1 verifier; parallel readers only as a demo "wow" if time allows. |
| Fixing bugs in a real external repo | Rejected | Too risky for a live demo. Use our own small "client product" with 2–3 planted bugs and tests. Say honestly in the pitch: demo product now, connect to a company repo later. |
| Infinite clarification loop | Changed | Capped at 2–3 rounds, then the issue bank. |
| "Lack of focus" critique | Rejected by team | A support agent should be multifaceted. But the **demo must be one user story**, not a list of features. |
| Pitch line "we can cut support staff" | Reframed | Sounds harsh to a jury of engineers. Use: "the same team handles 3× more requests, and engineers work on the product instead of tickets." |

## 7. Business case (for the pitch)

- Saves support and engineering time, so people move to more valuable work.
- Example math (state the assumptions, cite industry data):
  - 1,000 requests/day, 70% closed by the agent.
  - ~15 min of human time per ticket.
  - ≈ 175 hours saved per day.
- Plus revenue retained by the retention agent.
- Metrics:
  - % of requests closed without a human (deflection rate)
  - time to resolution
  - % of bugs auto-fixed
  - churn prevented
  - D1/D7 retention

## 8. Demo script (one user journey, ~2 min)

1. "I can't find my profile" → `link` card → one click.
2. "Button X doesn't work" → 1–2 clarifying questions → the agent finds and fixes the bug, tests pass → the engineer clicks Approve → the user is told it's fixed.
3. "I want to cancel my subscription" → the agent asks why and offers a discount on a card → the user clicks "Stay". **Main moment.**
4. Switch to the team dashboard: tickets, issue clusters, time and money saved.

**Rules:**
- Pre-fill the data.
- Log in before going on stage.
- Record a backup demo video by 16:00.
- One person talks, one person clicks.

## 9. Roles

| Person | Owns |
|---|---|
| 1 | Communication agent + issue classifier + clarification loop (backend) |
| 2 | Navi with action tools + cards + mock user/subscription DB + retention agent |
| 3 | Demo "client product" with planted bugs + fixer (Claude Code headless + tests) |
| 4 | UI: customer chat + team/engineer dashboard (diff, Approve/Reject, clusters), then pitch |

## 10. Timeline

- **10:40–11:15:** fill `docs/PLAN.md` together (API contracts between agents). No code.
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
