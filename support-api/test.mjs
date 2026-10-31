// Run: node --test test.mjs   (or against a deployed copy: API_URL=https://... node --test test.mjs)
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { server } from './server.js';

let base = process.env.API_URL;
before(async () => {
  if (base) return;
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.listening && server.close());
beforeEach(() => call('POST', '/api/admin/reset'));

async function call(method, path, body, caller = 'test-suite') {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Caller': caller },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const json = await res.json();
  // Every response uses the same envelope.
  assert.deepEqual(Object.keys(json).sort(), ['data', 'error', 'ok']);
  if (json.ok) assert.equal(json.error, null);
  else assert.deepEqual(Object.keys(json.error).sort(), ['code', 'message']);
  return { status: res.status, ...json };
}
const code = (r) => r.error?.code;
const DAY = 24 * 3600 * 1000;

/* get_account */

test('get_account returns parent, children, subscription, verification', async () => {
  const r = await call('GET', '/api/accounts/acc_1001');
  assert.equal(r.ok, true);
  assert.equal(r.data.parent_name, 'Anna Kovalenko');
  assert.equal(r.data.preferred_language, 'uk');
  assert.equal(r.data.verified, true);
  assert.deepEqual(r.data.children, [{ id: 'ch_2001', name: 'Max', grade: '4' }]);
  assert.equal(r.data.subscription.status, 'active');
  assert.equal(r.data.subscription.price.amount, 184);
  assert.ok(r.data.subscription.next_billing_date);
});

test('get_account: unknown id -> ACCOUNT_NOT_FOUND', async () => {
  const r = await call('GET', '/api/accounts/acc_9999');
  assert.equal(r.status, 404);
  assert.equal(code(r), 'ACCOUNT_NOT_FOUND');
});

test('seed edge cases: unverified account and cancelled subscription', async () => {
  assert.equal((await call('GET', '/api/accounts/acc_1002')).data.verified, false);
  assert.equal((await call('GET', '/api/accounts/acc_1005')).data.subscription.status, 'cancelled');
});

/* get_lessons */

test('get_lessons lists lessons with tutor, and notes + rating only on completed ones', async () => {
  const r = await call('GET', '/api/accounts/acc_1004/lessons');
  assert.equal(r.ok, true);
  assert.equal(r.data.count, 4);
  for (const l of r.data.lessons) {
    assert.ok(l.lesson_id && l.child_id && l.tutor.id && l.tutor.name && l.start && l.duration_min && l.topic);
    if (l.status === 'completed') assert.ok(l.tutor_note && l.progress_rating >= 1 && l.progress_rating <= 5);
    else assert.equal(l.tutor_note, undefined);
  }
});

test('get_lessons filters by child, status and date range', async () => {
  const child = await call('GET', '/api/accounts/acc_1004/lessons?child_id=ch_2005');
  assert.ok(child.data.lessons.every((l) => l.child_id === 'ch_2005'));
  const sched = await call('GET', '/api/accounts/acc_1001/lessons?status=scheduled');
  assert.equal(sched.data.count, 3);
  const from = new Date(Date.now() + 4 * DAY).toISOString();
  const ranged = await call('GET', `/api/accounts/acc_1001/lessons?from=${from}`);
  assert.ok(ranged.data.lessons.every((l) => new Date(l.start) >= new Date(from)));
});

test('get_lessons errors: INVALID_DATE_RANGE, CHILD_NOT_FOUND, ACCOUNT_NOT_FOUND', async () => {
  const backwards = await call('GET', `/api/accounts/acc_1001/lessons?from=${new Date(Date.now() + DAY).toISOString()}&to=${new Date().toISOString()}`);
  assert.equal(code(backwards), 'INVALID_DATE_RANGE');
  assert.equal(code(await call('GET', '/api/accounts/acc_1001/lessons?from=yesterday')), 'INVALID_DATE_RANGE');
  assert.equal(code(await call('GET', '/api/accounts/acc_1001/lessons?child_id=ch_2002')), 'CHILD_NOT_FOUND');
  assert.equal(code(await call('GET', '/api/accounts/nope/lessons')), 'ACCOUNT_NOT_FOUND');
});

/* reschedule_lesson */

test('reschedule: taken slot -> SLOT_UNAVAILABLE with up to 3 alternatives, then booking one works', async () => {
  const lessons = (await call('GET', '/api/accounts/acc_1004/lessons?child_id=ch_2004&status=scheduled')).data.lessons;
  const taken = lessons.find((l) => l.lesson_id === 'les_3104').start;
  const r = await call('POST', '/api/lessons/les_3002/reschedule', { new_start: taken, reason: 'Football practice' });
  assert.equal(r.status, 409);
  assert.equal(code(r), 'SLOT_UNAVAILABLE');
  const alts = r.data.alternatives;
  assert.ok(alts.length >= 1 && alts.length <= 3);
  assert.ok(alts.every((a) => new Date(a) - Date.now() >= DAY));

  const ok = await call('POST', '/api/lessons/les_3002/reschedule', { new_start: alts[0], reason: 'Football practice' });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.lesson.start, alts[0]);
  assert.ok(ok.data.previous_start);
});

test('reschedule: lesson < 24h away -> TOO_LATE', async () => {
  const r = await call('POST', '/api/lessons/les_3201/reschedule', { new_start: new Date(Date.now() + 3 * DAY).toISOString(), reason: 'Sick' });
  assert.equal(code(r), 'TOO_LATE');
});

test('reschedule: completed lesson -> NOT_RESCHEDULABLE; unknown -> LESSON_NOT_FOUND', async () => {
  const body = { new_start: new Date(Date.now() + 3 * DAY).toISOString(), reason: 'x' };
  assert.equal(code(await call('POST', '/api/lessons/les_3000/reschedule', body)), 'NOT_RESCHEDULABLE');
  assert.equal(code(await call('POST', '/api/lessons/les_0000/reschedule', body)), 'LESSON_NOT_FOUND');
});

test('reschedule: new time < 24h away -> SLOT_UNAVAILABLE with alternatives', async () => {
  const r = await call('POST', '/api/lessons/les_3002/reschedule', { new_start: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), reason: 'x' });
  assert.equal(code(r), 'SLOT_UNAVAILABLE');
  assert.ok(r.data.alternatives.length > 0);
});

test('reschedule: unverified account -> IDENTITY_NOT_VERIFIED; after verify, fully booked tutor gives no alternatives', async () => {
  const body = { new_start: new Date(Date.now() + 5 * DAY).toISOString(), reason: 'Exam week' };
  assert.equal(code(await call('POST', '/api/lessons/les_3102/reschedule', body)), 'IDENTITY_NOT_VERIFIED');
  assert.equal((await call('POST', '/api/accounts/acc_1002/verify', { email: 'BEN.carter@example.com', child_name: 'sofia' })).ok, true);
  const r = await call('POST', '/api/lessons/les_3102/reschedule', body);
  assert.equal(code(r), 'SLOT_UNAVAILABLE');
  assert.deepEqual(r.data.alternatives, []);
  assert.match(r.error.message, /assign_tutor/);
});

test('reschedule: missing reason or bad JSON -> INVALID_REQUEST', async () => {
  assert.equal(code(await call('POST', '/api/lessons/les_3002/reschedule', { new_start: new Date().toISOString() })), 'INVALID_REQUEST');
  assert.equal(code(await call('POST', '/api/lessons/les_3002/reschedule', '{not json')), 'INVALID_REQUEST');
});

/* assign_tutor */

test('assign_tutor switches tutor and reports moved / not-moved lessons', async () => {
  const r = await call('POST', '/api/accounts/acc_1001/assign_tutor', { child_id: 'ch_2001', new_tutor_id: 'tut_03', reason: 'Wants a high-school specialist' });
  assert.equal(r.ok, true);
  assert.equal(r.data.previous_tutor.id, 'tut_01');
  assert.equal(r.data.new_tutor.id, 'tut_03');
  assert.equal(r.data.moved_lessons.length + r.data.not_moved_lessons.length, 3);
  for (const l of r.data.moved_lessons) assert.equal(l.tutor.id, 'tut_03');
  for (const l of r.data.not_moved_lessons) { assert.equal(l.tutor.id, 'tut_01'); assert.ok(l.reason); }
  const after = (await call('GET', '/api/accounts/acc_1001/lessons?status=scheduled')).data.lessons;
  assert.equal(after.filter((l) => l.tutor.id === 'tut_03').length, r.data.moved_lessons.length);
});

test('assign_tutor errors: TUTOR_UNAVAILABLE (no slots / wrong subject), TUTOR_NOT_FOUND, CHILD_NOT_FOUND', async () => {
  const body = (tutor, child = 'ch_2001') => ({ child_id: child, new_tutor_id: tutor, reason: 'test' });
  assert.equal(code(await call('POST', '/api/accounts/acc_1001/assign_tutor', body('tut_02'))), 'TUTOR_UNAVAILABLE');
  assert.equal(code(await call('POST', '/api/accounts/acc_1001/assign_tutor', body('tut_04'))), 'TUTOR_UNAVAILABLE');
  assert.equal(code(await call('POST', '/api/accounts/acc_1001/assign_tutor', body('tut_99'))), 'TUTOR_NOT_FOUND');
  assert.equal(code(await call('POST', '/api/accounts/acc_1001/assign_tutor', body('tut_03', 'ch_2002'))), 'CHILD_NOT_FOUND');
  assert.equal(code(await call('POST', '/api/accounts/acc_1002/assign_tutor', body('tut_03', 'ch_2002'))), 'IDENTITY_NOT_VERIFIED');
});

/* cancel_subscription */

test('cancel immediately needs approval; preview refund matches the final refund', async () => {
  const body = { reason: 'Too expensive', effective: 'immediately', approved_by: null };
  const denied = await call('POST', '/api/accounts/acc_1001/subscription/cancel', body);
  assert.equal(denied.status, 403);
  assert.equal(code(denied), 'APPROVAL_REQUIRED');
  const preview = denied.data.preview.refund_amount;
  assert.ok(preview > 0 && preview < 184);

  const done = await call('POST', '/api/accounts/acc_1001/subscription/cancel', { ...body, approved_by: 'supervisor:olena' });
  assert.equal(done.ok, true);
  assert.equal(done.data.status, 'cancelled');
  assert.ok(Math.abs(done.data.refund_amount - preview) < 0.05);
  assert.equal(done.data.cancelled_lessons.length, 3);
  assert.equal(code(await call('POST', '/api/accounts/acc_1001/subscription/cancel', body)), 'ALREADY_CANCELLED');
});

test('cancel at end of period: no refund, effective on next billing date, not repeatable', async () => {
  const acct = (await call('GET', '/api/accounts/acc_1004')).data;
  const r = await call('POST', '/api/accounts/acc_1004/subscription/cancel', { reason: 'Summer break', effective: 'end_of_period', approved_by: null });
  assert.equal(r.ok, true);
  assert.equal(r.data.status, 'cancellation_scheduled');
  assert.equal(r.data.effective_date, acct.subscription.next_billing_date);
  assert.equal(r.data.refund_amount, 0);
  assert.equal(code(await call('POST', '/api/accounts/acc_1004/subscription/cancel', { reason: 'again', effective: 'end_of_period' })), 'ALREADY_CANCELLED');
});

test('cancel errors: ALREADY_CANCELLED, IDENTITY_NOT_VERIFIED, ACCOUNT_NOT_FOUND, INVALID_REQUEST', async () => {
  const body = { reason: 'x', effective: 'end_of_period' };
  assert.equal(code(await call('POST', '/api/accounts/acc_1005/subscription/cancel', body)), 'ALREADY_CANCELLED');
  assert.equal(code(await call('POST', '/api/accounts/acc_1002/subscription/cancel', body)), 'IDENTITY_NOT_VERIFIED');
  assert.equal(code(await call('POST', '/api/accounts/acc_0000/subscription/cancel', body)), 'ACCOUNT_NOT_FOUND');
  assert.equal(code(await call('POST', '/api/accounts/acc_1001/subscription/cancel', { reason: 'x', effective: 'tomorrow' })), 'INVALID_REQUEST');
});

/* verify, audit log, routing */

test('verify: wrong details -> VERIFICATION_FAILED and account stays unverified', async () => {
  const r = await call('POST', '/api/accounts/acc_1002/verify', { email: 'ben.carter@example.com', child_name: 'Max' });
  assert.equal(code(r), 'VERIFICATION_FAILED');
  assert.equal((await call('GET', '/api/accounts/acc_1002')).data.verified, false);
});

test('audit log records every tool call with timestamp, tool, args, caller, result', async () => {
  await call('GET', '/api/accounts/acc_1003', undefined, 'agent:navi');
  await call('POST', '/api/lessons/les_3201/reschedule', { new_start: new Date(Date.now() + 3 * DAY).toISOString(), reason: 'Sick' }, 'agent:navi');
  const log = (await call('GET', '/api/audit_log?limit=10')).data.entries;
  assert.equal(log.length, 2);
  const [latest, first] = log;
  assert.equal(first.tool, 'get_account');
  assert.equal(first.caller, 'agent:navi');
  assert.equal(first.args.account_id, 'acc_1003');
  assert.equal(first.result.ok, true);
  assert.equal(latest.tool, 'reschedule_lesson');
  assert.equal(latest.result.error.code, 'TOO_LATE');
  assert.ok(latest.timestamp && latest.args.reason === 'Sick');
  const filtered = (await call('GET', '/api/audit_log?tool=get_account')).data.entries;
  assert.ok(filtered.every((e) => e.tool === 'get_account'));
});

test('unknown route and wrong method use the envelope too', async () => {
  assert.equal(code(await call('GET', '/api/nope')), 'ROUTE_NOT_FOUND');
  assert.equal(code(await call('GET', '/api/lessons/les_3002/reschedule')), 'METHOD_NOT_ALLOWED');
});
