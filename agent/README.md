# Lumora support agent

The chatbot behind the "Chat with us" widget on the demo site. It answers from the RAG knowledge base (`../RAG`) and acts through the support-tool API (`../support-api`), using Gemini with function calling.

```
demo-site chat widget ──► agent (this folder) ──► Gemini (chat + tool calls)
                                   │
                                   ├─► RAG/lib: retrieve() from Supabase doc_chunks (public docs of tenant "lumora"),
                                   │            buildUserContext(), scanSensitive(), GROUNDING_RULES
                                   └─► support-api: get_account, get_lessons, list_tutors, verify,
                                                    reschedule_lesson, assign_tutor, cancel_subscription
```

## How one turn works

1. The widget sends `{ account_id, message, time_zone }`. In this demo, `account_id` stands in for a real login session.
2. The agent builds the turn context: `<session_info>` (time, time zone, verified, children), `<user_context>` from `buildUserContext` (plan, upcoming lessons, memory notes), and `<docs>` from `retrieve("lumora", message)`.
3. Gemini answers, or calls tools. Read tools run straight away. Change tools only create a **confirmation card**.
4. The parent clicks **Confirm** → the agent calls the support API, then tells Gemini the result so it can explain it (with alternative slots as quick replies).
5. An immediate cancellation also needs a **supervisor**: it waits in `/api/approvals` until someone approves it.

## Safety rules (from hackathon-context.md, section 6)

- **Session-scoped account.** No tool has an `account_id` parameter. Lesson and child ids from the model are checked against the session's account before anything happens.
- **Changes need a click.** The model can't change anything by itself; every write is a card the parent confirms. Writes also need a verified account (`verify_identity` with the account email and a child's name).
- **Grounded answers.** `GROUNDING_RULES` from the RAG; only `public` chunks of the tenant are searched. If the knowledge base is down, the model is told not to answer policy questions from memory.
- **Data, not instructions.** Docs, account data and tool results go in tagged blocks.
- **Output scan.** Replies run through `scanSensitive()` (keys, passwords, cards, IBANs masked).
- **Audit.** Every support-API call carries `X-Caller` (`agent:lumora-assistant`, `… (confirmed by parent)`, `human:<supervisor>`), visible in the support API's `/api/audit_log`.

## Run locally

```bash
cd RAG && npm install          # the agent imports RAG/lib
cd ../agent && npm install
cp .env.example .env.local     # fill GEMINI_API_KEY and SUPABASE_SERVICE_ROLE_KEY
npm start                      # http://localhost:8787
npm test                       # 12 tests with a fake model; no keys needed
```

To use the local agent from the site, set `agentUrl` in `demo-site/js/config.js` to `http://localhost:8787`.

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | Chat model and query embeddings |
| `SUPABASE_URL` | yes | `https://ygriuepyedzfupejluwb.supabase.co` (lumora-demo, holds `doc_chunks`) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server only; `match_chunks` is callable only with it |
| `GEMINI_MODEL` | no | Default `gemini-2.5-flash` |
| `SUPPORT_API_URL` | no | Default `https://lumora-api-lm0d.onrender.com` |
| `TENANT_ID` | no | Default `lumora` |
| `ALLOWED_ORIGIN` | no | CORS origin; default `*` |
| `SUPERVISOR_TOKEN` | no | Protects `/api/approvals` and `/api/tickets` (`Authorization: Bearer …`). Open if unset. |

## Endpoints

| Method | Path | For |
|---|---|---|
| POST | `/api/chat` `{ conversation_id?, account_id, message, time_zone? }` | Send a message; returns the whole conversation |
| GET | `/api/chat/{id}?account_id=` | Reload or poll a conversation |
| POST | `/api/chat/{id}/cards/{card_id}` `{ account_id, decision: "confirm" \| "dismiss" }` | Parent's click on a card |
| GET | `/api/approvals` | Supervisor: pending immediate cancellations, with refund preview |
| POST | `/api/approvals/{id}` `{ decision: "approve" \| "reject", approver }` | Supervisor decision |
| GET | `/api/tickets` | Hand-offs created by `escalate_to_human` (the issue bank) |
| GET | `/api/health` | Model, tenant and support API in use |

## Demo script

| Chat as | Say | What happens |
|---|---|---|
| Anna | "How late can I move a lesson?" | Answer from *Lessons and schedule*, with the source shown |
| Anna | "Move Max's Thursday lesson to Friday 5pm" | Card → Confirm → moved, or alternatives as quick replies |
| Ben | "Move Sofia's next lesson" | Asks for the email + child's name first (unverified account) |
| Ben | after verifying, the same | Leo is fully booked → suggests switching tutor → assign card |
| Chloe | "Why can't Lily join today?" | Reads the account: payment failed, explains, links billing help |
| David | "I want to cancel" | Asks why first, tries to fix it, then an end-of-period cancel card |
| Anna | "Cancel now and refund me" | Card → Confirm → waits for a supervisor → approve via `/api/approvals` |

## Limits

- Conversations, cards, approvals, tickets and memory notes are in memory: a restart (or a Render free-tier sleep) clears them.
- The support API has its own in-memory data, separate from the website's Supabase tables.
- Not tested against the real Gemini API in this repo: the tests use a scripted model. Run the demo script once you have keys, and tune `SYSTEM_PROMPT` in `src/prompt.ts` if needed.
