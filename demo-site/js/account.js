/* Lumora parent dashboard: reads the signed-in parent's data and runs toolkit actions through Supabase RPCs. */
(async function () {
  const { db, toast } = window.lumora;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  if (!db) {
    $('greeting').textContent = 'Accounts are not configured';
    $('alert-slot').innerHTML = '<div class="alert">js/config.js has no Supabase settings, so there is no data to show.</div>';
    return;
  }
  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData.session;
  if (!session) { location.replace('login.html'); return; }
  const uid = session.user.id;

  const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const money = (n) => '$' + Number(n).toFixed(2);
  const planName = { '3m': '3-month plan', '6m': '6-month plan', '12m': '12-month plan' };
  const statusLabel = { active: 'Active', paused: 'Paused', cancel_requested: 'Cancelling', cancelled: 'Cancelled', past_due: 'Payment failed' };
  const actionLabel = {
    pause_subscription: 'Paused subscription', resume_subscription: 'Resumed subscription', request_cancellation: 'Requested cancellation',
    accept_retention_offer: 'Accepted a discount offer', reschedule_lesson: 'Rescheduled a lesson', cancel_lesson: 'Cancelled a lesson',
    retry_payment: 'Payment retried successfully',
  };

  /* ---------- Action modal ---------- */

  const modal = $('action-modal');
  const content = $('action-content');
  const openModal = (html) => { content.innerHTML = html; modal.showModal(); };
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-action-close]')) modal.close(); });

  async function run(fn, args, okMsg) {
    const { error } = await db.rpc(fn, args);
    if (error) { toast(error.message); return false; }
    modal.close();
    toast(okMsg);
    await load();
    return true;
  }

  /* ---------- Rendering ---------- */

  let state = {};

  function renderSubscription(s) {
    if (!s) { $('subscription').innerHTML = '<p class="muted">No plan yet.</p><a class="btn btn--primary btn--sm" href="pricing.html">See plans</a>'; return; }
    const price = s.price_per_lesson * (1 - s.discount_pct / 100);
    const buttons = {
      active: '<button class="btn btn--ghost btn--sm" data-act="pause">Pause</button><button class="btn btn--ghost btn--sm" data-act="cancel">Cancel plan</button>',
      paused: '<button class="btn btn--primary btn--sm" data-act="resume">Resume now</button><button class="btn btn--ghost btn--sm" data-act="cancel">Cancel plan</button>',
      cancel_requested: '<button class="btn btn--primary btn--sm" data-act="resume">Keep my plan</button>',
      past_due: '<button class="btn btn--primary btn--sm" data-act="retry">Retry payment</button><button class="btn btn--ghost btn--sm" data-act="cancel">Cancel plan</button>',
      cancelled: '<a class="btn btn--primary btn--sm" href="pricing.html">Choose a new plan</a>',
    }[s.status];
    $('subscription').innerHTML = `
      <div class="plan-summary">
        <div><strong class="plan-name">${esc(planName[s.plan])}</strong> <span class="badge badge--${esc(s.status)}">${esc(statusLabel[s.status])}</span></div>
        <dl class="kv">
          <div><dt>Price per lesson</dt><dd>${money(price)}${s.discount_pct ? ` <span class="save">−${s.discount_pct}%</span>` : ''}</dd></div>
          <div><dt>Subjects</dt><dd>${s.subject_mode === 'both' ? 'Math + reading' : 'One subject'}</dd></div>
          <div><dt>Lessons per week</dt><dd>${s.lessons_per_week}</dd></div>
          <div><dt>Lessons remaining</dt><dd>${s.lessons_remaining}</dd></div>
          <div><dt>${s.status === 'paused' ? 'Paused until' : 'Renews on'}</dt><dd>${fmtDate(s.status === 'paused' ? s.paused_until : s.current_period_end)}</dd></div>
        </dl>
        ${s.cancel_reason ? `<p class="muted">Cancellation reason: “${esc(s.cancel_reason)}”</p>` : ''}
        <div class="btn-row">${buttons || ''}</div>
      </div>`;
  }

  function renderLessons(lessons) {
    const upcoming = lessons.filter((l) => l.status === 'scheduled' && new Date(l.starts_at) > new Date());
    $('lessons').innerHTML = upcoming.length
      ? upcoming.map((l) => `
        <li class="row">
          <div class="row-date"><strong>${fmtDate(l.starts_at)}</strong><span>${fmtTime(l.starts_at)} · ${l.duration_min} min</span></div>
          <div class="row-main"><strong>${esc(l.children?.first_name)}: ${esc(l.subject)}</strong><span class="muted">with ${esc(l.tutors?.full_name)}</span></div>
          <div class="row-actions">
            <button class="btn btn--ghost btn--sm" data-act="reschedule" data-id="${l.id}">Reschedule</button>
            <button class="link-btn" data-act="cancel-lesson" data-id="${l.id}">Cancel</button>
          </div>
        </li>`).join('')
      : `<li class="muted">${state.sub?.status === 'paused' ? 'Lessons are paused.' : 'No upcoming lessons.'}</li>`;
  }

  function renderChildren(children) {
    $('children').innerHTML = children.length
      ? children.map((c) => `<li class="row"><span class="avatar">${esc(c.first_name[0])}</span><div class="row-main"><strong>${esc(c.first_name)}</strong><span class="muted">Grade ${esc(c.grade)} · ${c.subjects.map(esc).join(' + ')}</span></div></li>`).join('')
      : '<li class="muted">No children added.</li>';
  }

  function renderPayments(payments) {
    $('payments').innerHTML = payments.length
      ? payments.map((p) => `<li class="row"><div class="row-main"><strong>${money(p.amount)}</strong><span class="muted">${fmtDate(p.created_at)} · ${esc(p.method)}${p.failure_reason ? ' · ' + esc(p.failure_reason) : ''}</span></div><span class="badge badge--${p.status === 'paid' ? 'active' : 'past_due'}">${esc(p.status)}</span></li>`).join('')
      : '<li class="muted">No payments yet.</li>';
  }

  function renderActivity(log) {
    $('activity').innerHTML = log.length
      ? log.map((a) => `<li class="row"><div class="row-main"><strong>${esc(actionLabel[a.action] || a.action)}</strong><span class="muted">${fmtDate(a.created_at)} ${fmtTime(a.created_at)}</span></div></li>`).join('')
      : '<li class="muted">Nothing yet. Changes you (or support) make will appear here.</li>';
  }

  function renderAlert(sub, payments) {
    const failed = payments.find((p) => p.status === 'failed');
    $('alert-slot').innerHTML =
      sub?.status === 'past_due' && failed
        ? `<div class="alert alert--danger"><strong>Your last payment didn’t go through.</strong> ${esc(failed.failure_reason || '')}. Lessons are on hold until it’s fixed. <button class="btn btn--dark btn--sm" data-act="retry">Retry payment</button></div>`
        : sub?.status === 'cancel_requested'
          ? '<div class="alert">Your plan will end at the close of this billing period. Changed your mind? Click “Keep my plan”.</div>'
          : '';
  }

  async function load() {
    const [profile, children, sub, lessons, payments, log] = await Promise.all([
      db.from('profiles').select('*').eq('id', uid).single(),
      db.from('children').select('*').order('first_name'),
      db.from('subscriptions').select('*').maybeSingle(),
      db.from('lessons').select('id, subject, starts_at, duration_min, status, children(first_name), tutors(full_name)').order('starts_at'),
      db.from('payments').select('*').order('created_at', { ascending: false }).limit(5),
      db.from('action_log').select('*').order('created_at', { ascending: false }).limit(8),
    ]);
    const firstError = [profile, children, sub, lessons, payments, log].find((r) => r.error);
    if (firstError) { $('alert-slot').innerHTML = `<div class="alert alert--danger">Could not load your account: ${esc(firstError.error.message)}</div>`; return; }

    state = { profile: profile.data, sub: sub.data, lessons: lessons.data };
    $('greeting').textContent = `Hi, ${profile.data.full_name.split(' ')[0]}`;
    $('pf-name').value = profile.data.full_name;
    $('pf-email').value = profile.data.email;
    $('pf-phone').value = profile.data.phone || '';
    $('pf-tz').value = profile.data.timezone;
    renderAlert(sub.data, payments.data);
    renderSubscription(sub.data);
    renderLessons(lessons.data);
    renderChildren(children.data);
    renderPayments(payments.data);
    renderActivity(log.data);
  }

  /* ---------- Actions ---------- */

  const toLocalInput = (d) => { const z = new Date(d - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); };

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;

    if (act === 'pause') {
      openModal(`<h2 id="action-title">Pause your plan</h2><p class="muted">Lessons stop and billing is paused. Your tutor keeps your slot.</p>
        <div class="btn-row">${[2, 4, 8].map((w) => `<button class="btn btn--ghost" data-pause="${w}">${w} weeks</button>`).join('')}</div>`);
    } else if (act === 'resume') {
      await run('resume_subscription', {}, 'Welcome back! Your plan is active.');
    } else if (act === 'retry') {
      await run('retry_payment', {}, 'Payment went through. Lessons are back on.');
    } else if (act === 'cancel') {
      openModal(`<h2 id="action-title">Before you go…</h2><p class="muted">Can you tell us why you want to cancel?</p>
        <div class="field"><label for="cx-reason">Reason</label><select id="cx-reason">
          <option>It’s too expensive</option><option>We don’t have enough time</option><option>My child is doing fine now</option>
          <option>Not happy with the tutor</option><option>Other</option></select></div>
        <div class="btn-row mt-32"><button class="btn btn--dark" data-cancel-next>Continue</button></div>`);
    } else if (act === 'reschedule') {
      const lesson = state.lessons.find((l) => l.id === b.dataset.id);
      const suggestion = new Date(new Date(lesson.starts_at).getTime() + 24 * 3600 * 1000);
      openModal(`<h2 id="action-title">Reschedule lesson</h2><p class="muted">Currently ${fmtDate(lesson.starts_at)} at ${fmtTime(lesson.starts_at)}. Free up to 4 hours before start.</p>
        <div class="field"><label for="rs-time">New date and time</label><input id="rs-time" type="datetime-local" step="900" value="${toLocalInput(suggestion)}"></div>
        <div class="btn-row mt-32"><button class="btn btn--primary" data-reschedule="${lesson.id}">Confirm new time</button></div>`);
    } else if (act === 'cancel-lesson') {
      const lesson = state.lessons.find((l) => l.id === b.dataset.id);
      openModal(`<h2 id="action-title">Cancel this lesson?</h2><p class="muted">${esc(lesson.children?.first_name)}’s ${esc(lesson.subject)} lesson on ${fmtDate(lesson.starts_at)} at ${fmtTime(lesson.starts_at)}.</p>
        <div class="btn-row"><button class="btn btn--dark" data-cancel-lesson="${lesson.id}">Yes, cancel it</button><button class="btn btn--ghost" data-action-close>Keep it</button></div>`);
    }
  });

  content.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.dataset.pause) await run('pause_subscription', { weeks: Number(t.dataset.pause) }, `Paused for ${t.dataset.pause} weeks.`);
    if (t.dataset.reschedule) {
      const v = $('rs-time').value;
      if (v) await run('reschedule_lesson', { lesson_id: t.dataset.reschedule, new_start: new Date(v).toISOString() }, 'Lesson moved. Your tutor has been notified.');
    }
    if (t.dataset.cancelLesson) await run('cancel_lesson', { lesson_id: t.dataset.cancelLesson }, 'Lesson cancelled.');
    if (t.hasAttribute('data-cancel-next')) {
      const reason = $('cx-reason').value;
      content.dataset.reason = reason;
      content.innerHTML = `<h2 id="action-title">We’d love you to stay</h2>
        <p class="muted">${reason.includes('expensive') ? 'How about 20% off every lesson from now on?' : 'Before you cancel, here’s an offer: 20% off every lesson, or a free pause.'}</p>
        <div class="offer"><strong>20% off</strong><span>Your price drops to ${money(state.sub.price_per_lesson * 0.8)} per lesson.</span></div>
        <div class="btn-row mt-32"><button class="btn btn--primary" data-offer="20">Stay with 20% off</button><button class="btn btn--ghost" data-offer-pause>Pause 4 weeks instead</button></div>
        <p class="mt-32"><button class="link-btn" data-cancel-anyway>No thanks, cancel my plan</button></p>`;
    }
    if (t.dataset.offer) await run('accept_retention_offer', { pct: Number(t.dataset.offer) }, 'Discount applied. Thanks for staying!');
    if (t.hasAttribute('data-offer-pause')) await run('pause_subscription', { weeks: 4 }, 'Paused for 4 weeks.');
    if (t.hasAttribute('data-cancel-anyway')) await run('request_cancellation', { reason: content.dataset.reason || 'Other' }, 'Cancellation requested.');
  });

  $('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await db.from('profiles')
      .update({ full_name: $('pf-name').value.trim(), phone: $('pf-phone').value.trim() || null, timezone: $('pf-tz').value })
      .eq('id', uid);
    toast(error ? error.message : 'Profile saved.');
    if (!error) load();
  });

  $('sign-out').addEventListener('click', async () => {
    await db.auth.signOut();
    location.href = 'index.html';
  });

  await load();
})();
