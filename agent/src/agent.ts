// Lumora support agent: RAG answers + support-API tools, with confirmation cards for every change.
//
// Security model (see hackathon-context.md, section 6):
// - The account comes from the session, never from the model: no tool takes an account_id.
// - The model can only *propose* changes. A change runs when the parent clicks the card (decide()),
//   and an immediate cancellation also needs a supervisor (decideApproval()).
// - Lesson / child ids from the model are checked against the session's own account before anything happens.
// - Retrieved docs, account data and tool results go to the model as tagged data; the reply is masked for secrets.
import { randomUUID } from "node:crypto";
import { toPromptContext, type Hit } from "../../RAG/lib/rag/retrieve";
import { scanSensitive } from "../../RAG/lib/rag/scan";
import { buildUserContext, inMemoryStore, remember, type AccountProvider, type MemoryStore } from "../../RAG/lib/user/context";
import { functionCalls, textOf, type Content, type Model, type Part } from "./gemini";
import { SYSTEM_PROMPT, TOOLS } from "./prompt";
import type { Envelope, SupportApi } from "./support-api";

export type Deps = {
  model: Model;
  api: SupportApi;
  retrieve: (tenantId: string, query: string) => Promise<Hit[]>;
  memory?: MemoryStore;
  tenantId?: string;
  maxSteps?: number;
  now?: () => Date;
};

type WriteTool = "reschedule_lesson" | "assign_tutor" | "cancel_subscription";
type CardStatus = "pending" | "done" | "failed" | "dismissed" | "awaiting_approval" | "rejected";

export type Card = {
  id: string;
  tool: WriteTool;
  title: string;
  details: string[];
  args: Record<string, any>;
  status: CardStatus;
  outcome?: string;
  result?: Envelope;
};

type QuickReply = { label: string; message: string };
type Entry = {
  role: "user" | "assistant" | "event";
  text: string;
  at: string;
  card_ids?: string[];
  sources?: string[];
  quick_replies?: QuickReply[];
};

type Conversation = {
  id: string;
  accountId: string;
  timeZone: string;
  contents: Content[];
  transcript: Entry[];
  cards: Map<string, Card>;
  busy: boolean;
  updatedAt: number;
};

export type Approval = {
  id: string;
  conversation_id: string;
  card_id: string;
  account_id: string;
  reason: string;
  preview: unknown;
  status: "pending" | "approved" | "rejected";
  decided_by?: string;
  created_at: string;
};

export type Ticket = { id: string; account_id: string; conversation_id: string; category: string; summary: string; created_at: string };

export class AgentError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const CALLER = "agent:lumora-assistant";
const CONFIRMED_CALLER = "agent:lumora-assistant (confirmed by parent)";
const ACCOUNT_ID = /^acc_\d{4}$/;
const CONTEXT_TAG = "<turn_context>";
const MAX_CONVERSATIONS = 500;
const DAY = 24 * 3600 * 1000;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const fail = (code: string, message: string): Envelope => ({ ok: false, data: null, error: { code, message } });
const escapeData = (text: string) => text.replace(/</g, "&lt;");
const titleOf = (source: string) => {
  const t = source.replace(/^.*\//, "").replace(/\.md$/, "").replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function validTimeZone(tz: unknown): string {
  try {
    if (typeof tz === "string" && tz) {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return tz;
    }
  } catch {}
  return "UTC";
}

export function formatLocal(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Adds `<key>_local` next to every ISO date-time (or list of them), so the model never converts time zones itself. */
export function withLocalTimes<T>(value: T, timeZone: string): T {
  if (Array.isArray(value)) return value.map((v) => withLocalTimes(v, timeZone)) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = withLocalTimes(v, timeZone);
    if (typeof v === "string" && ISO.test(v)) out[`${k}_local`] = formatLocal(v, timeZone);
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string" && ISO.test(x))) {
      out[`${k}_local`] = v.map((x: string) => formatLocal(x, timeZone));
    }
  }
  return out as T;
}

export function createAgent(deps: Deps) {
  const tenantId = deps.tenantId ?? "lumora";
  const memory = deps.memory ?? inMemoryStore();
  const maxSteps = deps.maxSteps ?? 6;
  const now = deps.now ?? (() => new Date());
  const conversations = new Map<string, Conversation>();
  const approvals = new Map<string, Approval>();
  const tickets: Ticket[] = [];

  /* ---------- Context for each turn ---------- */

  async function safeRetrieve(query: string): Promise<{ hits: Hit[]; failed: boolean }> {
    try {
      return { hits: await deps.retrieve(tenantId, query), failed: false };
    } catch (e) {
      console.error("retrieve failed:", e);
      return { hits: [], failed: true };
    }
  }

  async function turnContext(conv: Conversation, message: string) {
    const account = await deps.api.getAccount(conv.accountId, CALLER);
    const lessons = await deps.api.getLessons(conv.accountId, { status: "scheduled" }, CALLER);
    const a = account.data;
    const children = new Map<string, string>((a?.children ?? []).map((c: any) => [c.id, c.name]));

    const accounts: AccountProvider = {
      async getAccount() {
        if (!account.ok || !a) return null;
        return {
          name: a.parent_name,
          email: a.verified ? a.email : "(hidden until verified)",
          plan: { name: a.subscription.plan, status: a.subscription.status, renewsAt: a.subscription.next_billing_date ?? undefined },
          upcoming: lessons.ok
            ? lessons.data.lessons.slice(0, 6).map((l: any) => ({
                date: formatLocal(l.start, conv.timeZone),
                title: `${children.get(l.child_id) ?? l.child_id}: ${l.topic} with ${l.tutor.name} (${l.lesson_id})`,
              }))
            : [],
        };
      },
    };
    const userContext = await buildUserContext({ tenantId, userId: conv.accountId }, { accounts, memory });
    const session = {
      now: now().toISOString(),
      now_local: formatLocal(now().toISOString(), conv.timeZone),
      time_zone: conv.timeZone,
      verified: a?.verified ?? false,
      preferred_language: a?.preferred_language ?? "en",
      children: a?.children ?? [],
    };
    const { hits, failed } = await safeRetrieve(message);
    const docs = failed
      ? `<docs found="0">The knowledge base is unavailable right now. Do not answer policy questions from memory; offer to escalate.</docs>`
      : toPromptContext(hits);
    const text = `${CONTEXT_TAG}\n<session_info>\n${escapeData(JSON.stringify(session, null, 2))}\n</session_info>\n${userContext}\n<docs>\n${docs}\n</docs>\n</turn_context>`;
    return { text, hits };
  }

  /* ---------- Tools ---------- */

  async function ownLesson(conv: Conversation, lessonId: string) {
    const r = await deps.api.getLessons(conv.accountId, {}, CALLER);
    return r.ok ? r.data.lessons.find((l: any) => l.lesson_id === lessonId) ?? null : null;
  }

  async function verifiedAccount(conv: Conversation): Promise<{ account?: any; error?: Envelope }> {
    const r = await deps.api.getAccount(conv.accountId, CALLER);
    if (!r.ok) return { error: r };
    if (!r.data.verified) {
      return { error: fail("IDENTITY_NOT_VERIFIED", "Ask the parent for the account email and one child's first name, then call verify_identity.") };
    }
    return { account: r.data };
  }

  function addCard(conv: Conversation, card: Omit<Card, "id" | "status">): Envelope {
    const id = `card_${randomUUID().slice(0, 8)}`;
    conv.cards.set(id, { ...card, id, status: "pending" });
    return {
      ok: true,
      data: { status: "awaiting_parent_confirmation", card_id: id, note: "A confirmation card is now shown. Ask the parent to confirm it. Nothing has changed yet." },
      error: null,
    };
  }

  type ToolOutcome = { response: Envelope; cardId?: string; hits?: Hit[] };

  async function runTool(conv: Conversation, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
    const tz = conv.timeZone;
    switch (name) {
      case "search_knowledge_base": {
        const { hits, failed } = await safeRetrieve(s(args.query));
        if (failed) return { response: fail("KB_UNAVAILABLE", "The knowledge base is unavailable right now.") };
        return { response: { ok: true, data: { docs: toPromptContext(hits) }, error: null }, hits };
      }
      case "get_account": {
        const r = await deps.api.getAccount(conv.accountId, CALLER);
        if (r.ok && !r.data.verified) r.data = { ...r.data, email: "(hidden until verified)" };
        return { response: withLocalTimes(r, tz) };
      }
      case "get_lessons": {
        const filters = { child_id: s(args.child_id), status: s(args.status), from: s(args.from), to: s(args.to) };
        return { response: withLocalTimes(await deps.api.getLessons(conv.accountId, filters, CALLER), tz) };
      }
      case "list_tutors":
        return { response: await deps.api.listTutors(s(args.subject) || undefined, CALLER) };
      case "verify_identity":
        return { response: await deps.api.verify(conv.accountId, { email: s(args.email), child_name: s(args.child_name) }, CALLER) };

      case "reschedule_lesson": {
        const lessonId = s(args.lesson_id);
        const newStart = s(args.new_start);
        const reason = s(args.reason);
        if (!lessonId || !newStart || !reason) return { response: fail("INVALID_REQUEST", "lesson_id, new_start and reason are required.") };
        const lesson = await ownLesson(conv, lessonId);
        if (!lesson) return { response: fail("LESSON_NOT_FOUND", "There is no lesson with that id on this account.") };
        const { account, error } = await verifiedAccount(conv);
        if (error) return { response: error };
        const childName = account.children.find((c: any) => c.id === lesson.child_id)?.name ?? "your child";
        if (lesson.status !== "scheduled") return { response: fail("NOT_RESCHEDULABLE", `This lesson is "${lesson.status}"; only scheduled lessons can be moved.`) };
        if (new Date(lesson.start).getTime() - now().getTime() < DAY) {
          return { response: fail("TOO_LATE", "This lesson starts in less than 24 hours and can no longer be moved.") };
        }
        const when = new Date(newStart);
        if (Number.isNaN(when.getTime())) return { response: fail("INVALID_REQUEST", "new_start must be an ISO 8601 date-time.") };
        if (when.getTime() - now().getTime() < DAY) {
          return { response: fail("SLOT_UNAVAILABLE", "The new time must be at least 24 hours from now. Ask for a later time.") };
        }
        const res = addCard(conv, {
          tool: "reschedule_lesson",
          title: `Move ${childName}'s lesson`,
          details: [
            `Lesson: ${lesson.topic}`,
            `From: ${formatLocal(lesson.start, tz)}`,
            `To: ${formatLocal(when.toISOString(), tz)}`,
            `Tutor: ${lesson.tutor.name}`,
            `Reason: ${reason}`,
          ],
          args: { lesson_id: lessonId, new_start: when.toISOString(), reason },
        });
        return { response: res, cardId: (res.data as any).card_id };
      }

      case "assign_tutor": {
        const childId = s(args.child_id);
        const tutorId = s(args.new_tutor_id);
        const reason = s(args.reason);
        if (!childId || !tutorId || !reason) return { response: fail("INVALID_REQUEST", "child_id, new_tutor_id and reason are required.") };
        const { account, error } = await verifiedAccount(conv);
        if (error) return { response: error };
        const child = account.children.find((c: any) => c.id === childId);
        if (!child) return { response: fail("CHILD_NOT_FOUND", "There is no child with that id on this account.") };
        const tutors = await deps.api.listTutors(undefined, CALLER);
        const tutor = tutors.ok ? tutors.data.tutors.find((t: any) => t.id === tutorId) : null;
        if (!tutor) return { response: fail("TUTOR_NOT_FOUND", "No tutor with that id. Use list_tutors.") };
        if (!tutor.has_free_slots) return { response: fail("TUTOR_UNAVAILABLE", `${tutor.name} has no free slots. Suggest another tutor.`) };
        const res = addCard(conv, {
          tool: "assign_tutor",
          title: `Switch ${child.name}'s tutor to ${tutor.name}`,
          details: [
            `New tutor: ${tutor.name} (${tutor.subjects.join(", ")}, rating ${tutor.rating})`,
            "Upcoming lessons move to the new tutor where they're free at the same time.",
            `Reason: ${reason}`,
          ],
          args: { child_id: childId, new_tutor_id: tutorId, reason },
        });
        return { response: res, cardId: (res.data as any).card_id };
      }

      case "cancel_subscription": {
        const reason = s(args.reason);
        const effective = s(args.effective);
        if (!reason || !["end_of_period", "immediately"].includes(effective)) {
          return { response: fail("INVALID_REQUEST", 'reason is required and effective must be "end_of_period" or "immediately".') };
        }
        const { account, error } = await verifiedAccount(conv);
        if (error) return { response: error };
        const sub = account.subscription;
        if (sub.status === "cancelled") return { response: fail("ALREADY_CANCELLED", "The subscription is already cancelled.") };
        if (sub.status === "cancellation_scheduled" && effective === "end_of_period") {
          return { response: fail("ALREADY_CANCELLED", "The subscription is already set to end at the end of this period.") };
        }
        const ends = effective === "end_of_period" && sub.next_billing_date
          ? `Ends on ${formatLocal(sub.next_billing_date, tz)}. No refund; lessons continue until then.`
          : "Ends now, with a refund for the unused part of this month. A supervisor must approve it.";
        const res = addCard(conv, {
          tool: "cancel_subscription",
          title: effective === "immediately" ? "Cancel subscription now" : "Cancel subscription at the end of this period",
          details: [`Plan: ${sub.plan}`, ends, `Reason: ${reason}`],
          args: { reason, effective },
        });
        return { response: res, cardId: (res.data as any).card_id };
      }

      case "escalate_to_human": {
        const ticket: Ticket = {
          id: `tkt_${randomUUID().slice(0, 8)}`, account_id: conv.accountId, conversation_id: conv.id,
          category: s(args.category) || "other", summary: s(args.summary).slice(0, 2000), created_at: now().toISOString(),
        };
        tickets.push(ticket);
        return { response: { ok: true, data: { ticket_id: ticket.id }, error: null } };
      }
      case "remember_note":
        await remember(memory, { tenantId, userId: conv.accountId }, s(args.note));
        return { response: { ok: true, data: { saved: true }, error: null } };
      default:
        return { response: fail("UNKNOWN_TOOL", `There is no tool called ${name}.`) };
    }
  }

  /* ---------- Model loop ---------- */

  async function runModel(conv: Conversation): Promise<{ text: string; cardIds: string[]; hits: Hit[] }> {
    const cardIds: string[] = [];
    const hits: Hit[] = [];
    for (let step = 0; step < maxSteps; step++) {
      const reply = await deps.model({ system: SYSTEM_PROMPT, contents: conv.contents, tools: TOOLS });
      conv.contents.push(reply);
      const calls = functionCalls(reply);
      if (!calls.length) {
        const text = scanSensitive(textOf(reply)).text || "Sorry, I didn't catch that. Could you say it another way?";
        return { text, cardIds, hits };
      }
      const responses: Part[] = [];
      for (const call of calls) {
        const out = await runTool(conv, call.name, (call.args ?? {}) as Record<string, unknown>);
        if (out.cardId) cardIds.push(out.cardId);
        if (out.hits) hits.push(...out.hits);
        responses.push({ functionResponse: { name: call.name, response: out.response as unknown as Record<string, unknown> } });
      }
      conv.contents.push({ role: "user", parts: responses });
    }
    return { text: "Sorry, I couldn't finish that. Could you try again, or ask me to pass it to the team?", cardIds, hits };
  }

  /** Drops the bulky context from earlier turns; each turn gets fresh docs and account data. */
  function stripOldContext(conv: Conversation) {
    for (const c of conv.contents) {
      if (c.role !== "user") continue;
      c.parts = c.parts.filter((p) => !("text" in p && p.text.startsWith(CONTEXT_TAG)));
      if (!c.parts.length) c.parts = [{ text: "(context omitted)" }];
    }
  }

  async function step(conv: Conversation, userParts: Part[], quickReplies?: QuickReply[], extraHits: Hit[] = []) {
    conv.contents.push({ role: "user", parts: userParts });
    const { text, cardIds, hits } = await runModel(conv);
    const sources = [...new Set([...extraHits, ...hits].map((h) => titleOf(h.source)))];
    conv.transcript.push({
      role: "assistant", text, at: now().toISOString(),
      ...(cardIds.length ? { card_ids: cardIds } : {}),
      ...(sources.length ? { sources } : {}),
      ...(quickReplies?.length ? { quick_replies: quickReplies } : {}),
    });
  }

  async function withLock<T>(conv: Conversation, fn: () => Promise<T>): Promise<T> {
    if (conv.busy) throw new AgentError(409, "BUSY", "Still working on the previous message.");
    conv.busy = true;
    try {
      return await fn();
    } finally {
      conv.busy = false;
      conv.updatedAt = Date.now();
    }
  }

  function getConversation(id: string, accountId: string): Conversation {
    const conv = conversations.get(id);
    if (!conv) throw new AgentError(404, "CONVERSATION_NOT_FOUND", "Unknown conversation.");
    if (conv.accountId !== accountId) throw new AgentError(403, "CONVERSATION_ACCOUNT_MISMATCH", "This conversation belongs to another account.");
    return conv;
  }

  function view(conv: Conversation) {
    const publicCard = (c: Card) => ({ id: c.id, tool: c.tool, title: c.title, details: c.details, status: c.status, outcome: c.outcome ?? null });
    return {
      conversation_id: conv.id,
      account_id: conv.accountId,
      messages: conv.transcript.map((e) => ({
        ...e,
        cards: (e.card_ids ?? []).map((id) => publicCard(conv.cards.get(id)!)),
      })),
      waiting_for_supervisor: [...conv.cards.values()].some((c) => c.status === "awaiting_approval"),
    };
  }

  function outcomeOf(card: Card, r: Envelope, timeZone: string): string {
    if (r.ok) {
      if (card.tool === "assign_tutor") {
        const d = r.data as any;
        return `Done: ${d.moved_lessons.length} lesson(s) moved${d.not_moved_lessons.length ? `, ${d.not_moved_lessons.length} kept` : ""}.`;
      }
      if (card.tool === "cancel_subscription") {
        const d = r.data as any;
        return d.status === "cancelled" ? `Cancelled. Refund: ${d.refund_amount} ${d.currency}.` : `Will end on ${formatLocal(d.effective_date, timeZone)}.`;
      }
      return "Done.";
    }
    // API messages contain UTC timestamps; show them in the parent's time zone.
    return r.error!.message.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, (iso) => formatLocal(iso, timeZone));
  }

  /* ---------- Public API ---------- */

  async function sendMessage(input: { conversationId?: string; accountId: string; message: string; timeZone?: string }) {
    const accountId = s(input.accountId);
    const message = s(input.message);
    if (!ACCOUNT_ID.test(accountId)) throw new AgentError(400, "INVALID_ACCOUNT", "account_id must look like acc_1001.");
    if (!message || message.length > 2000) throw new AgentError(400, "INVALID_MESSAGE", "message must be 1-2000 characters.");

    let conv: Conversation;
    if (input.conversationId) {
      conv = getConversation(input.conversationId, accountId);
    } else {
      conv = {
        id: `conv_${randomUUID().slice(0, 12)}`, accountId, timeZone: validTimeZone(input.timeZone),
        contents: [], transcript: [], cards: new Map(), busy: false, updatedAt: Date.now(),
      };
      conversations.set(conv.id, conv);
      if (conversations.size > MAX_CONVERSATIONS) {
        const oldest = [...conversations.values()].sort((x, y) => x.updatedAt - y.updatedAt)[0];
        conversations.delete(oldest.id);
      }
    }

    return withLock(conv, async () => {
      const before = { contents: conv.contents.length, transcript: conv.transcript.length };
      try {
        conv.transcript.push({ role: "user", text: message, at: now().toISOString() });
        stripOldContext(conv);
        const ctx = await turnContext(conv, message);
        await step(conv, [{ text: ctx.text }, { text: `Parent's message: ${message}` }], undefined, ctx.hits);
        return view(conv);
      } catch (e) {
        // Roll back a half-finished turn (e.g. the model was rate-limited) so the parent can simply resend.
        conv.contents.length = before.contents;
        conv.transcript.length = before.transcript;
        throw e;
      }
    });
  }

  async function decide(input: { conversationId: string; accountId: string; cardId: string; decision: "confirm" | "dismiss" }) {
    const conv = getConversation(input.conversationId, s(input.accountId));
    const card = conv.cards.get(input.cardId);
    if (!card) throw new AgentError(404, "CARD_NOT_FOUND", "Unknown card.");
    if (card.status !== "pending") throw new AgentError(409, "CARD_ALREADY_DECIDED", `This card is already ${card.status}.`);
    if (!["confirm", "dismiss"].includes(input.decision)) throw new AgentError(400, "INVALID_DECISION", 'decision must be "confirm" or "dismiss".');

    return withLock(conv, async () => {
      if (input.decision === "dismiss") {
        card.status = "dismissed";
        conv.transcript.push({ role: "event", text: `Dismissed: ${card.title}`, at: now().toISOString() });
        await step(conv, [{ text: `[system note] The parent dismissed card ${card.id} (${card.tool}). Nothing was changed.` }]);
        return view(conv);
      }

      let r: Envelope;
      if (card.tool === "reschedule_lesson") {
        r = await deps.api.reschedule(card.args.lesson_id, { new_start: card.args.new_start, reason: card.args.reason }, CONFIRMED_CALLER);
      } else if (card.tool === "assign_tutor") {
        r = await deps.api.assignTutor(conv.accountId, card.args as any, CONFIRMED_CALLER);
      } else {
        r = await deps.api.cancelSubscription(conv.accountId, { ...card.args, approved_by: null } as any, CONFIRMED_CALLER);
      }
      r = withLocalTimes(r, conv.timeZone);
      card.result = r;

      let quickReplies: QuickReply[] | undefined;
      if (!r.ok && r.error?.code === "APPROVAL_REQUIRED") {
        card.status = "awaiting_approval";
        card.outcome = "Waiting for a supervisor to approve.";
        const approval: Approval = {
          id: `apr_${randomUUID().slice(0, 8)}`, conversation_id: conv.id, card_id: card.id, account_id: conv.accountId,
          reason: card.args.reason, preview: (r.data as any)?.preview ?? null, status: "pending", created_at: now().toISOString(),
        };
        approvals.set(approval.id, approval);
      } else {
        card.status = r.ok ? "done" : "failed";
        card.outcome = outcomeOf(card, r, conv.timeZone);
        const alts = (r.data as any)?.alternatives_local as string[] | undefined;
        if (!r.ok && alts?.length) {
          quickReplies = alts.map((label) => ({ label, message: `Please move it to ${label}.` }));
        }
      }
      conv.transcript.push({ role: "event", text: `Confirmed: ${card.title}`, at: now().toISOString() });
      await step(conv, [{ text: `[system note] The parent confirmed card ${card.id} (${card.tool}). Result: ${JSON.stringify(r)}` }], quickReplies);
      return view(conv);
    });
  }

  function conversation(id: string, accountId: string) {
    return view(getConversation(id, s(accountId)));
  }

  function listApprovals() {
    return [...approvals.values()].filter((a) => a.status === "pending");
  }

  async function decideApproval(input: { approvalId: string; decision: "approve" | "reject"; approver: string }) {
    const approval = approvals.get(input.approvalId);
    if (!approval) throw new AgentError(404, "APPROVAL_NOT_FOUND", "Unknown approval.");
    if (approval.status !== "pending") throw new AgentError(409, "APPROVAL_ALREADY_DECIDED", `Already ${approval.status}.`);
    const approver = s(input.approver);
    if (!approver) throw new AgentError(400, "INVALID_APPROVER", "approver is required.");
    if (!["approve", "reject"].includes(input.decision)) throw new AgentError(400, "INVALID_DECISION", 'decision must be "approve" or "reject".');
    const conv = conversations.get(approval.conversation_id)!;
    const card = conv.cards.get(approval.card_id)!;

    return withLock(conv, async () => {
      approval.status = input.decision === "approve" ? "approved" : "rejected";
      approval.decided_by = approver;
      if (input.decision === "reject") {
        card.status = "rejected";
        card.outcome = `Not approved by ${approver}.`;
        await step(conv, [{ text: `[system note] A supervisor (${approver}) did not approve the immediate cancellation. The subscription is unchanged. Offer cancellation at the end of the period instead, or a human follow-up.` }]);
      } else {
        const r = withLocalTimes(
          await deps.api.cancelSubscription(conv.accountId, { reason: card.args.reason, effective: "immediately", approved_by: `supervisor:${approver}` }, `human:${approver}`),
          conv.timeZone
        );
        card.result = r;
        card.status = r.ok ? "done" : "failed";
        card.outcome = outcomeOf(card, r, conv.timeZone);
        await step(conv, [{ text: `[system note] A supervisor (${approver}) approved the immediate cancellation. Result: ${JSON.stringify(r)}` }]);
      }
      return { approval, conversation: view(conv) };
    });
  }

  return { sendMessage, decide, conversation, listApprovals, decideApproval, tickets: () => [...tickets].reverse() };
}

export type Agent = ReturnType<typeof createAgent>;
