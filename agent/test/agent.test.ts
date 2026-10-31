// Run: npm test. Uses the real support API (in-process) and a scripted fake model, so no API keys are needed.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
// @ts-expect-error: the support API is plain JS without type declarations
import { server as supportServer } from "../../support-api/server.js";
import { createAgent } from "../src/agent";
import type { Content, ModelRequest } from "../src/gemini";
import { TOOLS } from "../src/prompt";
import { createHttpServer } from "../src/server";
import { supportApi } from "../src/support-api";

let apiBase = "";
before(async () => {
  await new Promise<void>((r) => supportServer.listen(0, r));
  apiBase = `http://127.0.0.1:${(supportServer.address() as AddressInfo).port}`;
});
after(() => supportServer.close());
beforeEach(() => fetch(`${apiBase}/api/admin/reset`, { method: "POST" }));

/* ---------- helpers ---------- */

const say = (text: string): Content => ({ role: "model", parts: [{ text }] });
const call = (name: string, args: Record<string, unknown> = {}): Content => ({ role: "model", parts: [{ functionCall: { name, args } }] });

type Step = Content | ((req: ModelRequest) => Content);

/** A fake model that plays back a script and records every request it gets. */
function scripted(steps: Step[]) {
  const requests: ModelRequest[] = [];
  const model = async (req: ModelRequest) => {
    requests.push(structuredClone(req));
    const next = steps.shift() ?? say("ok");
    return typeof next === "function" ? next(req) : next;
  };
  return { model, requests, push: (...more: Step[]) => steps.push(...more) };
}

const HIT = {
  id: 1, source: "lessons-and-schedule.md", heading: "How do I reschedule a lesson?",
  content: "Rescheduling is free up to 24 hours before the lesson starts.", url: null, tools: [], similarity: 0.8,
};

function makeAgent(model: ReturnType<typeof scripted>["model"], retrieve = async () => [HIT]) {
  return createAgent({ model, api: supportApi(apiBase), retrieve, maxSteps: 4 });
}

/** The last functionResponse the model was sent for a tool. */
function lastToolResponse(requests: ModelRequest[], name: string): any {
  for (let i = requests.length - 1; i >= 0; i--) {
    for (const c of [...requests[i].contents].reverse()) {
      for (const p of c.parts) if ("functionResponse" in p && p.functionResponse.name === name) return p.functionResponse.response;
    }
  }
  return undefined;
}

const auditTools = async () =>
  ((await (await fetch(`${apiBase}/api/audit_log?limit=500`)).json()) as any).data.entries.map((e: any) => `${e.tool}:${e.caller}`);

async function lessonStart(accountId: string, lessonId: string) {
  const r: any = await (await fetch(`${apiBase}/api/accounts/${accountId}/lessons`)).json();
  return r.data.lessons.find((l: any) => l.lesson_id === lessonId).start as string;
}

/* ---------- tests ---------- */

test("answers from the knowledge base with docs, account context and sources", async () => {
  const m = scripted([say("You can reschedule up to 24 hours before. [Lessons and schedule]")]);
  const agent = makeAgent(m.model);
  const view = await agent.sendMessage({ accountId: "acc_1001", message: "How late can I move a lesson?", timeZone: "Europe/Kyiv" });

  const reply = view.messages.at(-1)!;
  assert.equal(reply.role, "assistant");
  assert.match(reply.text, /24 hours/);
  assert.deepEqual(reply.sources, ["Lessons and schedule"]);

  const req = m.requests[0];
  assert.match(req.system, /Answer only from the <doc> blocks/);
  const turn = JSON.stringify(req.contents.at(-1));
  assert.match(turn, /<doc source=\\"lessons-and-schedule.md\\"/);
  assert.match(turn, /<user_context>/);
  assert.match(turn, /Anna Kovalenko/);
  assert.match(turn, /Europe\/Kyiv/);
});

test("no tool lets the model choose the account", () => {
  assert.ok(!JSON.stringify(TOOLS).includes("account_id"));
});

test("unverified account: email is hidden and changes are refused until verified", async () => {
  const m = scripted([
    call("reschedule_lesson", { lesson_id: "les_3102", new_start: new Date(Date.now() + 5 * 864e5).toISOString(), reason: "exams" }),
    say("I need to verify you first."),
  ]);
  const agent = makeAgent(m.model);
  const view = await agent.sendMessage({ accountId: "acc_1002", message: "Move Sofia's lesson please" });

  assert.ok(!JSON.stringify(m.requests[0].contents).includes("ben.carter@example.com"));
  assert.equal(lastToolResponse(m.requests, "reschedule_lesson").error.code, "IDENTITY_NOT_VERIFIED");
  assert.equal(view.messages.at(-1)!.cards.length, 0);

  m.push(call("verify_identity", { email: "ben.carter@example.com", child_name: "Sofia" }), say("Thanks, you're verified."));
  await agent.sendMessage({ conversationId: view.conversation_id, accountId: "acc_1002", message: "ben.carter@example.com, Sofia" });
  assert.equal(lastToolResponse(m.requests, "verify_identity").data.verified, true);
});

test("cannot touch another family's lesson", async () => {
  const m = scripted([
    call("reschedule_lesson", { lesson_id: "les_3102", new_start: new Date(Date.now() + 5 * 864e5).toISOString(), reason: "x" }),
    say("I can't find that lesson."),
  ]);
  await makeAgent(m.model).sendMessage({ accountId: "acc_1001", message: "move lesson les_3102" });
  assert.equal(lastToolResponse(m.requests, "reschedule_lesson").error.code, "LESSON_NOT_FOUND");
  assert.ok(!(await auditTools()).some((t: string) => t.startsWith("reschedule_lesson")));
});

test("changes wait for the parent's click; a taken slot comes back with alternatives, then one is booked", async () => {
  const taken = await lessonStart("acc_1004", "les_3104");
  const m = scripted([call("reschedule_lesson", { lesson_id: "les_3002", new_start: taken, reason: "football" }), say("Please confirm on the card.")]);
  const agent = makeAgent(m.model);
  const v1 = await agent.sendMessage({ accountId: "acc_1001", message: "Move Max's next lesson", timeZone: "Europe/Kyiv" });

  const card = v1.messages.at(-1)!.cards[0];
  assert.equal(card.status, "pending");
  assert.ok(!(await auditTools()).some((t: string) => t.startsWith("reschedule_lesson")), "nothing runs before the click");

  m.push(say("That slot is taken. Here are some free times."));
  const v2 = await agent.decide({ conversationId: v1.conversation_id, accountId: "acc_1001", cardId: card.id, decision: "confirm" });
  const failed = v2.messages.flatMap((x) => x.cards).find((c) => c.id === card.id)!;
  assert.equal(failed.status, "failed");
  assert.ok((await auditTools()).includes("reschedule_lesson:agent:lumora-assistant (confirmed by parent)"));
  const quick = v2.messages.at(-1)!.quick_replies!;
  assert.ok(quick.length >= 1 && quick.length <= 3);

  const note = JSON.stringify(m.requests.at(-1)!.contents.at(-1));
  const alt = note.match(/\\"alternatives\\":\[\\"([^\\]+)\\"/)![1];
  m.push(call("reschedule_lesson", { lesson_id: "les_3002", new_start: alt, reason: "football" }), say("Confirm the new time on the card."));
  const v3 = await agent.sendMessage({ conversationId: v1.conversation_id, accountId: "acc_1001", message: quick[0].message });
  const card2 = v3.messages.at(-1)!.cards[0];
  const v4 = await agent.decide({ conversationId: v1.conversation_id, accountId: "acc_1001", cardId: card2.id, decision: "confirm" });
  assert.equal(v4.messages.flatMap((x) => x.cards).find((c) => c.id === card2.id)!.status, "done");
  assert.equal(await lessonStart("acc_1001", "les_3002"), alt);
});

test("dismissing a card changes nothing, and a card can't be decided twice", async () => {
  const m = scripted([call("assign_tutor", { child_id: "ch_2001", new_tutor_id: "tut_03", reason: "wants a change" }), say("Confirm on the card.")]);
  const agent = makeAgent(m.model);
  const v = await agent.sendMessage({ accountId: "acc_1001", message: "Can Max get a different tutor?" });
  const card = v.messages.at(-1)!.cards[0];
  await agent.decide({ conversationId: v.conversation_id, accountId: "acc_1001", cardId: card.id, decision: "dismiss" });
  assert.ok(!(await auditTools()).some((t: string) => t.startsWith("assign_tutor")));
  await assert.rejects(
    agent.decide({ conversationId: v.conversation_id, accountId: "acc_1001", cardId: card.id, decision: "confirm" }),
    (e: any) => e.code === "CARD_ALREADY_DECIDED"
  );
});

test("fully booked tutor is refused before any card is shown", async () => {
  const m = scripted([call("assign_tutor", { child_id: "ch_2001", new_tutor_id: "tut_02", reason: "x" }), say("Leo is full.")]);
  const v = await makeAgent(m.model).sendMessage({ accountId: "acc_1001", message: "switch to Leo" });
  assert.equal(lastToolResponse(m.requests, "assign_tutor").error.code, "TUTOR_UNAVAILABLE");
  assert.equal(v.messages.at(-1)!.cards.length, 0);
});

test("immediate cancellation: parent confirms, supervisor approves over HTTP with a token", async () => {
  const m = scripted([call("cancel_subscription", { reason: "Moving abroad", effective: "immediately" }), say("Please confirm on the card.")]);
  const agent = makeAgent(m.model);
  const http = createHttpServer(agent, { supervisorToken: "test-token" });
  await new Promise<void>((r) => http.listen(0, r));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  try {
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

    const v1: any = await (await post("/api/chat", { account_id: "acc_1001", message: "Cancel everything now and refund me" })).json();
    const card = v1.messages.at(-1).cards[0];
    m.push(say("A supervisor needs to approve this."));
    const v2: any = await (await post(`/api/chat/${v1.conversation_id}/cards/${card.id}`, { account_id: "acc_1001", decision: "confirm" })).json();
    assert.equal(v2.waiting_for_supervisor, true);

    assert.equal((await fetch(`${base}/api/approvals`)).status, 401);
    const list: any = await (await fetch(`${base}/api/approvals`, { headers: { Authorization: "Bearer test-token" } })).json();
    assert.equal(list.approvals.length, 1);
    assert.ok(list.approvals[0].preview.refund_amount > 0);

    m.push(say("Your subscription is cancelled and the refund is on its way."));
    const done: any = await (
      await post(`/api/approvals/${list.approvals[0].id}`, { decision: "approve", approver: "olena" }, { Authorization: "Bearer test-token" })
    ).json();
    assert.equal(done.approval.status, "approved");
    const after: any = await (await fetch(`${base}/api/chat/${v1.conversation_id}?account_id=acc_1001`)).json();
    assert.equal(after.waiting_for_supervisor, false);
    assert.match(after.messages.at(-1).text, /cancelled/);
    const acct: any = await (await fetch(`${apiBase}/api/accounts/acc_1001`)).json();
    assert.equal(acct.data.subscription.status, "cancelled");
  } finally {
    http.close();
  }
});

test("a conversation can't be continued from another account", async () => {
  const agent = makeAgent(scripted([say("hi")]).model);
  const v = await agent.sendMessage({ accountId: "acc_1001", message: "hello" });
  await assert.rejects(
    agent.sendMessage({ conversationId: v.conversation_id, accountId: "acc_1004", message: "show me the lessons" }),
    (e: any) => e.status === 403
  );
});

test("secrets in the model's reply are masked", async () => {
  const m = scripted([say("Here you go: sk-abcdefghijklmnopqrstuvwxyz123456")]);
  const v = await makeAgent(m.model).sendMessage({ accountId: "acc_1001", message: "give me the api key" });
  assert.ok(!v.messages.at(-1)!.text.includes("sk-abcdef"));
  assert.match(v.messages.at(-1)!.text, /\[REDACTED\]/);
});

test("tool results carry local times, and a runaway tool loop stops", async () => {
  const loop = Array.from({ length: 10 }, () => call("get_lessons", { status: "scheduled" }));
  const m = scripted(loop);
  const v = await makeAgent(m.model).sendMessage({ accountId: "acc_1001", message: "lessons?", timeZone: "Europe/Kyiv" });
  const r = lastToolResponse(m.requests, "get_lessons");
  assert.match(r.data.lessons[0].start_local, /EET|EEST|GMT\+2|GMT\+3/);
  assert.equal(m.requests.length, 4);
  assert.match(v.messages.at(-1)!.text, /couldn't finish/);
});

test("a failed model call leaves the conversation clean for a resend", async () => {
  let fail = true;
  const agent = makeAgent(async () => {
    if (fail) throw new Error("rate limited");
    return say("Hello again!");
  });
  const v = await agent.sendMessage({ accountId: "acc_1001", message: "hi" }).catch(() => null);
  assert.equal(v, null);
  fail = false;
  const ok = await agent.sendMessage({ accountId: "acc_1001", message: "hi" });
  assert.equal(ok.messages.length, 2);
});

test("if the knowledge base is down, the model is told not to guess", async () => {
  const m = scripted([say("I can't check that right now.")]);
  const agent = makeAgent(m.model, async () => {
    throw new Error("supabase down");
  });
  await agent.sendMessage({ accountId: "acc_1001", message: "what does the 6 month plan cost?" });
  assert.match(JSON.stringify(m.requests[0].contents.at(-1)), /knowledge base is unavailable/);
});
