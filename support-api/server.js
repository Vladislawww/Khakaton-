// Lumora support API: mock support tools for the hackathon agent. No dependencies (Node 20+).
// All state lives in memory and is rebuilt from seed.js on boot or via POST /api/admin/reset.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { buildSeed } from './seed.js';

const PORT = Number(process.env.PORT) || 3000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const SLOT_STEP = 30 * 60000;          // alternatives are offered on the half hour
const SEARCH_HORIZON = 14 * DAY;       // how far ahead to look for free slots
const MIN_NOTICE = 24 * HOUR;          // lessons can't be moved inside this window
const AUDIT_LIMIT = 2000;

let state;
let audit;
let auditSeq;

function reset() {
  state = buildSeed(new Date());
  audit = [];
  auditSeq = 0;
}
reset();

/* ---------- Envelope and errors ---------- */

const HTTP_STATUS = {
  ACCOUNT_NOT_FOUND: 404, LESSON_NOT_FOUND: 404, CHILD_NOT_FOUND: 404, TUTOR_NOT_FOUND: 404, ROUTE_NOT_FOUND: 404,
  IDENTITY_NOT_VERIFIED: 403, APPROVAL_REQUIRED: 403, VERIFICATION_FAILED: 403,
  INVALID_REQUEST: 400, INVALID_DATE_RANGE: 400,
  NOT_RESCHEDULABLE: 409, SLOT_UNAVAILABLE: 409, TOO_LATE: 409, TUTOR_UNAVAILABLE: 409, ALREADY_CANCELLED: 409,
  METHOD_NOT_ALLOWED: 405,
};

const ok = (data) => ({ ok: true, data, error: null });
const fail = (code, message, data = null) => ({ ok: false, data, error: { code, message } });
class ApiError extends Error {
  constructor(code, message, data = null) { super(message); this.code = code; this.data = data; }
}

/* ---------- Lookups and helpers ---------- */

const now = () => new Date();
const iso = (d) => (d ? new Date(d).toISOString() : null);
const round2 = (n) => Math.round(n * 100) / 100;

const findAccount = (id) => state.accounts.find((a) => a.id === id);
const findChild = (id) => state.children.find((c) => c.id === id);
const findTutor = (id) => state.tutors.find((t) => t.id === id);
const findLesson = (id) => state.lessons.find((l) => l.id === id);
const childrenOf = (accountId) => state.children.filter((c) => c.account_id === accountId);
const lessonEnd = (l) => new Date(new Date(l.start).getTime() + l.duration_min * 60000);

function requireAccount(id) {
  const account = findAccount(id);
  if (!account) throw new ApiError('ACCOUNT_NOT_FOUND', `No account with id "${id}".`);
  return account;
}

function requireVerified(account) {
  if (!account.verified) {
    throw new ApiError('IDENTITY_NOT_VERIFIED', `Account ${account.id} has not been verified. Verify the caller's identity before making changes.`);
  }
}

function requireString(body, field, { optional = false } = {}) {
  const v = body[field];
  if (optional && (v === undefined || v === null)) return null;
  if (typeof v !== 'string' || !v.trim()) throw new ApiError('INVALID_REQUEST', `"${field}" must be a non-empty string.`);
  return v.trim();
}

function parseDate(value, field, code = 'INVALID_REQUEST') {
  const d = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(d.getTime())) throw new ApiError(code, `"${field}" must be an ISO 8601 date-time.`);
  return d;
}

/* ---------- Tutor calendar ---------- */

// True if [start, start+duration) fits inside one of the tutor's weekly availability windows (UTC).
function withinAvailability(tutor, start, durationMin) {
  const windows = tutor.availability[start.getUTCDay()] || [];
  const dayStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const from = start.getTime();
  const to = from + durationMin * 60000;
  return windows.some(([h1, h2]) => from >= dayStart + h1 * HOUR && to <= dayStart + h2 * HOUR);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// Why a tutor can't take this slot, or null if they can. `ignoreLessonId` is the lesson being moved.
function slotProblem(tutor, start, durationMin, { ignoreLessonId = null, childId = null } = {}) {
  if (!withinAvailability(tutor, start, durationMin)) return 'outside the tutor’s working hours';
  const end = new Date(start.getTime() + durationMin * 60000);
  const clash = state.lessons.find(
    (l) => l.id !== ignoreLessonId && l.status === 'scheduled' &&
      (l.tutor_id === tutor.id || (childId && l.child_id === childId)) &&
      overlaps(start, end, new Date(l.start), lessonEnd(l))
  );
  if (clash) return clash.tutor_id === tutor.id ? 'the tutor has another lesson at this time' : 'the child has another lesson at this time';
  return null;
}

// Up to `limit` free slots for this tutor, at least 24h from now, nearest to `near` first (then later ones).
function freeSlots(tutor, durationMin, { near = now(), ignoreLessonId = null, childId = null, limit = 3 } = {}) {
  const earliest = now().getTime() + MIN_NOTICE;
  let t = Math.ceil(Math.max(near.getTime(), earliest) / SLOT_STEP) * SLOT_STEP;
  const stop = now().getTime() + SEARCH_HORIZON;
  const found = [];
  for (; t <= stop && found.length < limit; t += SLOT_STEP) {
    const start = new Date(t);
    if (!slotProblem(tutor, start, durationMin, { ignoreLessonId, childId })) found.push(start.toISOString());
  }
  // If nothing after `near`, look between "24h from now" and `near` as well.
  if (found.length < limit && near.getTime() > earliest) {
    for (let s = Math.ceil(earliest / SLOT_STEP) * SLOT_STEP; s < near.getTime() && found.length < limit; s += SLOT_STEP) {
      const start = new Date(s);
      if (!slotProblem(tutor, start, durationMin, { ignoreLessonId, childId })) found.push(start.toISOString());
    }
  }
  return found.sort();
}

/* ---------- Serializers ---------- */

function lessonView(l) {
  const tutor = findTutor(l.tutor_id);
  const view = {
    lesson_id: l.id, child_id: l.child_id, tutor: { id: tutor.id, name: tutor.name },
    start: iso(l.start), duration_min: l.duration_min, status: l.status, topic: l.topic,
  };
  if (l.status === 'completed') { view.tutor_note = l.tutor_note; view.progress_rating = l.progress_rating; }
  return view;
}

function subscriptionView(s) {
  return {
    plan: s.plan, status: s.status, price: s.price, next_billing_date: iso(s.next_billing_date),
    ...(s.cancel_effective_date ? { cancel_effective_date: iso(s.cancel_effective_date) } : {}),
  };
}

/* ---------- Tools ---------- */

function getAccount({ account_id }) {
  const a = requireAccount(account_id);
  return {
    account_id: a.id, parent_name: a.parent_name, email: a.email, preferred_language: a.preferred_language,
    verified: a.verified,
    children: childrenOf(a.id).map((c) => ({ id: c.id, name: c.name, grade: c.grade })),
    subscription: subscriptionView(a.subscription),
  };
}

const LESSON_STATUSES = ['scheduled', 'completed', 'cancelled', 'missed'];

function getLessons({ account_id, child_id, status, from, to }) {
  const a = requireAccount(account_id);
  const kids = childrenOf(a.id);
  if (child_id && !kids.some((c) => c.id === child_id)) throw new ApiError('CHILD_NOT_FOUND', `Child "${child_id}" is not on account ${a.id}.`);
  if (status && !LESSON_STATUSES.includes(status)) throw new ApiError('INVALID_REQUEST', `"status" must be one of ${LESSON_STATUSES.join(', ')}.`);
  const fromD = from ? parseDate(from, 'from', 'INVALID_DATE_RANGE') : null;
  const toD = to ? parseDate(to, 'to', 'INVALID_DATE_RANGE') : null;
  if (fromD && toD && fromD > toD) throw new ApiError('INVALID_DATE_RANGE', '"from" must be before "to".');
  const ids = new Set(child_id ? [child_id] : kids.map((c) => c.id));
  const lessons = state.lessons
    .filter((l) => ids.has(l.child_id))
    .filter((l) => !status || l.status === status)
    .filter((l) => (!fromD || new Date(l.start) >= fromD) && (!toD || new Date(l.start) <= toD))
    .sort((x, y) => new Date(x.start) - new Date(y.start))
    .map(lessonView);
  return { account_id: a.id, count: lessons.length, lessons };
}

function rescheduleLesson({ lesson_id }, body) {
  const newStartRaw = body.new_start;
  requireString(body, 'reason');
  const lesson = findLesson(lesson_id);
  if (!lesson) throw new ApiError('LESSON_NOT_FOUND', `No lesson with id "${lesson_id}".`);
  const child = findChild(lesson.child_id);
  requireVerified(findAccount(child.account_id));
  if (lesson.status !== 'scheduled') {
    throw new ApiError('NOT_RESCHEDULABLE', `Lesson ${lesson.id} is "${lesson.status}"; only scheduled lessons can be moved.`);
  }
  if (new Date(lesson.start).getTime() - now().getTime() < MIN_NOTICE) {
    throw new ApiError('TOO_LATE', `Lesson ${lesson.id} starts in less than 24 hours and can no longer be rescheduled.`);
  }
  const newStart = parseDate(newStartRaw, 'new_start');
  const tutor = findTutor(lesson.tutor_id);
  const opts = { ignoreLessonId: lesson.id, childId: child.id };
  const problem = newStart.getTime() - now().getTime() < MIN_NOTICE
    ? 'the new time is less than 24 hours away'
    : slotProblem(tutor, newStart, lesson.duration_min, opts);
  if (problem) {
    const alternatives = freeSlots(tutor, lesson.duration_min, { ...opts, near: newStart });
    throw new ApiError('SLOT_UNAVAILABLE', `Can't move the lesson to ${newStart.toISOString()}: ${problem}.` +
      (alternatives.length ? '' : ` ${tutor.name} has no free slots in the next 14 days; consider assign_tutor.`),
      { lesson_id: lesson.id, requested_start: newStart.toISOString(), alternatives });
  }
  const previous = iso(lesson.start);
  lesson.start = newStart;
  return { lesson: lessonView(lesson), previous_start: previous };
}

function assignTutor({ account_id }, body) {
  const childId = requireString(body, 'child_id');
  const newTutorId = requireString(body, 'new_tutor_id');
  requireString(body, 'reason');
  const account = requireAccount(account_id);
  requireVerified(account);
  const child = findChild(childId);
  if (!child || child.account_id !== account.id) throw new ApiError('CHILD_NOT_FOUND', `Child "${childId}" is not on account ${account.id}.`);
  const tutor = findTutor(newTutorId);
  if (!tutor) throw new ApiError('TUTOR_NOT_FOUND', `No tutor with id "${newTutorId}".`);
  if (tutor.id === child.regular_tutor_id) throw new ApiError('INVALID_REQUEST', `${tutor.name} is already ${child.name}'s tutor.`);
  if (!tutor.subjects.includes(child.subject)) {
    throw new ApiError('TUTOR_UNAVAILABLE', `${tutor.name} doesn't teach ${child.subject}.`);
  }
  if (!freeSlots(tutor, 50, { limit: 1 }).length) {
    throw new ApiError('TUTOR_UNAVAILABLE', `${tutor.name} has no free slots in the next 14 days.`);
  }

  const previousTutor = findTutor(child.regular_tutor_id);
  child.regular_tutor_id = tutor.id;
  const moved = [];
  const notMoved = [];
  const upcoming = state.lessons
    .filter((l) => l.child_id === child.id && l.status === 'scheduled' && new Date(l.start) > now())
    .sort((x, y) => new Date(x.start) - new Date(y.start));
  for (const l of upcoming) {
    const start = new Date(l.start);
    if (start.getTime() - now().getTime() < MIN_NOTICE) {
      notMoved.push({ ...lessonView(l), reason: 'starts in less than 24 hours, so it stays with the current tutor' });
      continue;
    }
    const problem = slotProblem(tutor, start, l.duration_min, { ignoreLessonId: l.id, childId: child.id });
    if (problem) {
      notMoved.push({ ...lessonView(l), reason: problem,
        suggested_slots: freeSlots(tutor, l.duration_min, { near: start, ignoreLessonId: l.id, childId: child.id }) });
    } else {
      l.tutor_id = tutor.id;
      moved.push(lessonView(l));
    }
  }
  return {
    child_id: child.id, previous_tutor: { id: previousTutor.id, name: previousTutor.name },
    new_tutor: { id: tutor.id, name: tutor.name }, moved_lessons: moved, not_moved_lessons: notMoved,
  };
}

function cancelSubscription({ account_id }, body) {
  const reason = requireString(body, 'reason');
  const effective = body.effective;
  if (!['end_of_period', 'immediately'].includes(effective)) {
    throw new ApiError('INVALID_REQUEST', '"effective" must be "end_of_period" or "immediately".');
  }
  const approvedBy = requireString(body, 'approved_by', { optional: true });
  const account = requireAccount(account_id);
  requireVerified(account);
  const s = account.subscription;
  if (s.status === 'cancelled') throw new ApiError('ALREADY_CANCELLED', `The subscription was already cancelled on ${iso(s.cancelled_at)}.`);
  if (s.status === 'cancellation_scheduled' && effective === 'end_of_period') {
    throw new ApiError('ALREADY_CANCELLED', `The subscription is already set to end on ${iso(s.cancel_effective_date)}.`);
  }

  const t = now();
  if (effective === 'end_of_period') {
    const effectiveDate = s.next_billing_date && new Date(s.next_billing_date) > t ? new Date(s.next_billing_date) : t;
    s.status = 'cancellation_scheduled';
    s.cancel_effective_date = effectiveDate;
    s.cancel_reason = reason;
    return { account_id: account.id, status: s.status, effective_date: iso(effectiveDate), refund_amount: 0, currency: s.price.currency };
  }

  // Immediately: refund the unused part of the current, already-paid period.
  const periodStart = new Date(s.period_start).getTime();
  const periodEnd = s.next_billing_date ? new Date(s.next_billing_date).getTime() : t.getTime();
  const remaining = periodEnd > t.getTime() ? (periodEnd - t.getTime()) / (periodEnd - periodStart) : 0;
  const refund = s.status === 'past_due' ? 0 : round2(s.last_payment * remaining);
  if (!approvedBy) {
    throw new ApiError('APPROVAL_REQUIRED', 'Immediate cancellation with a refund needs a human approver. Resend with "approved_by" set.', {
      preview: { effective_date: iso(t), refund_amount: refund, currency: s.price.currency },
    });
  }
  s.status = 'cancelled';
  s.cancelled_at = t;
  s.cancel_reason = reason;
  s.cancel_effective_date = t;
  s.approved_by = approvedBy;
  s.next_billing_date = null;
  const kidIds = new Set(childrenOf(account.id).map((c) => c.id));
  const cancelledLessons = [];
  for (const l of state.lessons) {
    if (kidIds.has(l.child_id) && l.status === 'scheduled' && new Date(l.start) > t) { l.status = 'cancelled'; cancelledLessons.push(l.id); }
  }
  return {
    account_id: account.id, status: s.status, effective_date: iso(t), refund_amount: refund, currency: s.price.currency,
    approved_by: approvedBy, cancelled_lessons: cancelledLessons,
  };
}

// Read-only helper so the agent can find a tutor id for assign_tutor.
function listTutors({ subject }) {
  if (subject && !['math', 'reading'].includes(subject)) throw new ApiError('INVALID_REQUEST', '"subject" must be math or reading.');
  const tutors = state.tutors
    .filter((t) => !subject || t.subjects.includes(subject))
    .map((t) => ({ id: t.id, name: t.name, subjects: t.subjects, rating: t.rating, has_free_slots: freeSlots(t, 50, { limit: 1 }).length > 0 }));
  return { count: tutors.length, tutors };
}

// Mock identity check the agent runs before any write: the caller must know the account email and a child's name.
function verifyIdentity({ account_id }, body) {
  const email = requireString(body, 'email');
  const childName = requireString(body, 'child_name');
  const account = requireAccount(account_id);
  const match = account.email.toLowerCase() === email.toLowerCase() &&
    childrenOf(account.id).some((c) => c.name.toLowerCase() === childName.toLowerCase());
  if (!match) throw new ApiError('VERIFICATION_FAILED', 'The details don’t match this account.');
  account.verified = true;
  return { account_id: account.id, verified: true };
}

/* ---------- Routing ---------- */

const routes = [
  { method: 'GET',  path: /^\/api\/accounts\/([^/]+)$/,                         tool: 'get_account',         params: ['account_id'], handler: (p) => getAccount(p) },
  { method: 'GET',  path: /^\/api\/accounts\/([^/]+)\/lessons$/,                tool: 'get_lessons',         params: ['account_id'], handler: (p, _b, q) => getLessons({ ...p, ...q }) },
  { method: 'POST', path: /^\/api\/lessons\/([^/]+)\/reschedule$/,              tool: 'reschedule_lesson',   params: ['lesson_id'],  handler: rescheduleLesson },
  { method: 'POST', path: /^\/api\/accounts\/([^/]+)\/assign_tutor$/,           tool: 'assign_tutor',        params: ['account_id'], handler: assignTutor },
  { method: 'POST', path: /^\/api\/accounts\/([^/]+)\/subscription\/cancel$/,   tool: 'cancel_subscription', params: ['account_id'], handler: cancelSubscription },
  { method: 'POST', path: /^\/api\/accounts\/([^/]+)\/verify$/,                 tool: 'verify_identity',     params: ['account_id'], handler: verifyIdentity },
  { method: 'GET',  path: /^\/api\/tutors$/,                                     tool: 'list_tutors',         params: [],             handler: (_p, _b, q) => listTutors(q) },
];

const INDEX = {
  service: 'Lumora support API (mock data, fictional company)',
  envelope: '{ ok: bool, data: {...} | null, error: { code, message } | null }',
  endpoints: [
    'GET  /api/accounts/{account_id}',
    'GET  /api/accounts/{account_id}/lessons?child_id=&status=&from=&to=',
    'POST /api/lessons/{lesson_id}/reschedule',
    'POST /api/accounts/{account_id}/assign_tutor',
    'POST /api/accounts/{account_id}/subscription/cancel',
    'POST /api/accounts/{account_id}/verify',
    'GET  /api/tutors?subject=',
    'GET  /api/audit_log?account_id=&tool=&limit=',
    'POST /api/admin/reset',
  ],
  sample_accounts: ['acc_1001', 'acc_1002', 'acc_1003', 'acc_1004', 'acc_1005'],
  docs: 'https://github.com/Vladislawww/Khakaton-/tree/feat/demo-site/support-api',
};

function record(tool, args, caller, result) {
  audit.push({ id: ++auditSeq, timestamp: new Date().toISOString(), tool, args, caller, result });
  if (audit.length > AUDIT_LIMIT) audit.shift();
}

function auditView(query) {
  const limit = Math.min(Number(query.limit) || 100, AUDIT_LIMIT);
  const entries = audit
    .filter((e) => !query.tool || e.tool === query.tool)
    .filter((e) => !query.account_id || JSON.stringify(e.args).includes(`"${query.account_id}"`) || e.result?.data?.account_id === query.account_id)
    .slice(-limit)
    .reverse();
  return { count: entries.length, entries };
}

function send(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Caller',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 16 * 1024) { reject(new ApiError('INVALID_REQUEST', 'Request body is too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        resolve(parsed);
      } catch {
        reject(new ApiError('INVALID_REQUEST', 'Body must be a JSON object.'));
      }
    });
    req.on('error', reject);
  });
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(url.searchParams);
  const caller = String(req.headers['x-caller'] || 'anonymous').slice(0, 100);

  if (req.method === 'OPTIONS') return send(res, 204, null);
  if (req.method === 'GET' && (path === '/' || path === '/api')) return send(res, 200, ok(INDEX));
  if (req.method === 'GET' && path === '/api/health') return send(res, 200, ok({ status: 'up', time: new Date().toISOString() }));
  if (req.method === 'GET' && path === '/api/audit_log') return send(res, 200, ok(auditView(query)));
  if (req.method === 'POST' && path === '/api/admin/reset') {
    reset();
    return send(res, 200, ok({ reset: true, time: new Date().toISOString() }));
  }

  const route = routes.find((r) => r.path.test(path));
  if (!route) return send(res, 404, fail('ROUTE_NOT_FOUND', `No endpoint at ${req.method} ${path}.`));
  if (route.method !== req.method) return send(res, 405, fail('METHOD_NOT_ALLOWED', `Use ${route.method} for ${path}.`));

  const match = path.match(route.path);
  const params = Object.fromEntries(route.params.map((name, i) => [name, decodeURIComponent(match[i + 1])]));
  let body = {};
  let result;
  try {
    if (route.method === 'POST') body = await readBody(req);
    result = ok(route.handler(params, body, query));
  } catch (e) {
    result = e instanceof ApiError ? fail(e.code, e.message, e.data) : fail('INTERNAL_ERROR', 'Unexpected server error.');
    if (!(e instanceof ApiError)) console.error(e);
  }
  record(route.tool, { ...params, ...query, ...body }, caller, result);
  send(res, result.ok ? 200 : HTTP_STATUS[result.error.code] || 500, result);
});

// Listen only when run directly (`node server.js`), not when imported by the tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(PORT, () => console.log(`Lumora support API listening on :${PORT}`));
}
