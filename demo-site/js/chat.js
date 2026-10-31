/* Lumora support chat widget: talks to the agent service (agent/), renders replies, cards and quick replies. */
(function () {
  const cfg = window.LUMORA_CONFIG || {};
  const AGENT = (cfg.agentUrl || '').replace(/\/$/, '');
  const PERSONAS = [
    { id: 'acc_1001', name: 'Anna Kovalenko', note: 'happy path', email: 'anna.kovalenko@example.com' },
    { id: 'acc_1002', name: 'Ben Carter', note: 'unverified', email: 'ben.carter@example.com' },
    { id: 'acc_1003', name: 'Chloe Nguyen', note: 'payment failed', email: 'chloe.nguyen@example.com' },
    { id: 'acc_1004', name: 'David Okafor', note: 'two kids', email: 'david.okafor@example.com' },
    { id: 'acc_1005', name: 'Emma Rossi', note: 'cancelled', email: 'emma.rossi@example.com' },
  ];
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} },
  };

  let account = store.get('lumora-chat-account') || PERSONAS[0].id;
  let conversationId = store.get(`lumora-chat-${account}`);
  let busy = false;
  let pollTimer = null;

  /* ---------- DOM ---------- */

  document.body.insertAdjacentHTML('beforeend', `
    <button class="chat-launcher" aria-expanded="false" aria-controls="chat-panel">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="currentColor"/></svg>
      <span>Chat with us</span>
    </button>
    <section class="chat-panel" id="chat-panel" role="dialog" aria-label="Lumora support chat" hidden>
      <header class="chat-head">
        <div><strong>Lumora support</strong><span class="chat-sub">AI assistant · answers from our help center</span></div>
        <button class="chat-close" aria-label="Close chat">×</button>
      </header>
      <label class="chat-persona">Demo: chatting as
        <select>${PERSONAS.map((p) => `<option value="${p.id}">${p.name} (${p.note})</option>`).join('')}</select>
      </label>
      <div class="chat-log" aria-live="polite"></div>
      <form class="chat-form">
        <label class="sr-only" for="chat-input">Message</label>
        <textarea id="chat-input" rows="1" placeholder="Type your question…" maxlength="2000"></textarea>
        <button class="btn btn--primary btn--sm" aria-label="Send">Send</button>
      </form>
    </section>`);

  const launcher = document.querySelector('.chat-launcher');
  const panel = document.getElementById('chat-panel');
  const log = panel.querySelector('.chat-log');
  const form = panel.querySelector('.chat-form');
  const input = panel.querySelector('textarea');
  const select = panel.querySelector('select');
  select.value = account;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rich = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  function open(prefill) {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    launcher.classList.add('is-open');
    if (!log.children.length) restore();
    if (prefill) input.value = prefill;
    input.focus();
  }
  function close() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.classList.remove('is-open');
    launcher.focus();
  }
  launcher.addEventListener('click', () => (panel.hidden ? open() : close()));
  panel.querySelector('.chat-close').addEventListener('click', close);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-chat]');
    if (t) { e.preventDefault(); open(t.dataset.chat || ''); }
  });

  // If a parent is signed in on the site, chat as them.
  window.lumora?.db?.auth.getSession().then(({ data }) => {
    const match = PERSONAS.find((p) => p.email === data.session?.user?.email);
    if (match && match.id !== account) switchAccount(match.id);
  });

  select.addEventListener('change', () => switchAccount(select.value));
  function switchAccount(id) {
    account = id;
    select.value = id;
    store.set('lumora-chat-account', id);
    conversationId = store.get(`lumora-chat-${id}`);
    log.innerHTML = '';
    restore();
  }

  /* ---------- Rendering ---------- */

  function greet() {
    const who = PERSONAS.find((p) => p.id === account);
    log.innerHTML = `<div class="msg msg--assistant"><p>Hi${who ? ' ' + esc(who.name.split(' ')[0]) : ''}! I’m Lumora’s assistant. Ask me about lessons, your plan, tutors or anything on the site. I can also move lessons or change tutors for you, with your OK.</p></div>`;
  }

  function cardHtml(c) {
    const label = { pending: 'Needs your OK', done: 'Done', failed: 'Not done', dismissed: 'Dismissed', awaiting_approval: 'Waiting for a supervisor', rejected: 'Not approved' }[c.status];
    return `<div class="chat-card chat-card--${c.status}" data-card="${esc(c.id)}">
      <div class="chat-card-head"><strong>${esc(c.title)}</strong><span class="badge">${esc(label)}</span></div>
      <ul>${c.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      ${c.outcome ? `<p class="chat-card-outcome">${esc(c.outcome)}</p>` : ''}
      ${c.status === 'pending' ? `<div class="btn-row"><button class="btn btn--primary btn--sm" data-decide="confirm">Confirm</button><button class="btn btn--ghost btn--sm" data-decide="dismiss">Not now</button></div>` : ''}
    </div>`;
  }

  function render(view) {
    log.innerHTML = '';
    greet();
    const last = view.messages.length - 1;
    view.messages.forEach((m, i) => {
      if (m.role === 'event') {
        log.insertAdjacentHTML('beforeend', `<div class="msg msg--event">${esc(m.text)}</div>`);
        return;
      }
      const sources = m.sources?.length ? `<p class="chat-sources">From: ${m.sources.map(esc).join(', ')}</p>` : '';
      const quick = i === last && m.quick_replies?.length
        ? `<div class="chat-quick">${m.quick_replies.map((q) => `<button class="chip" data-quick="${esc(q.message)}">${esc(q.label)}</button>`).join('')}</div>`
        : '';
      log.insertAdjacentHTML('beforeend', `<div class="msg msg--${m.role}"><p>${rich(m.text)}</p>${m.cards.map(cardHtml).join('')}${sources}${quick}</div>`);
    });
    log.scrollTop = log.scrollHeight;
    clearTimeout(pollTimer);
    if (view.waiting_for_supervisor) pollTimer = setTimeout(refresh, 4000);
  }

  function typing(on, slow) {
    log.querySelector('.msg--typing')?.remove();
    if (on) {
      log.insertAdjacentHTML('beforeend', `<div class="msg msg--assistant msg--typing"><span></span><span></span><span></span>${slow ? '<em>Waking up the assistant, this can take up to a minute…</em>' : ''}</div>`);
      log.scrollTop = log.scrollHeight;
    }
  }

  function showError(text) {
    log.insertAdjacentHTML('beforeend', `<div class="msg msg--error">${esc(text)}</div>`);
    log.scrollTop = log.scrollHeight;
  }

  /* ---------- Network ---------- */

  async function request(method, path, body) {
    let slowTimer = setTimeout(() => typing(true, true), 6000);
    try {
      const res = await fetch(AGENT + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message || `The assistant returned ${res.status}.`);
      return json;
    } finally {
      clearTimeout(slowTimer);
    }
  }

  async function restore() {
    greet();
    if (!AGENT) { showError('Chat isn’t configured on this copy of the site (agentUrl in js/config.js).'); return; }
    if (!conversationId) return;
    try {
      render(await request('GET', `/api/chat/${encodeURIComponent(conversationId)}?account_id=${account}`));
    } catch {
      conversationId = null;
      store.set(`lumora-chat-${account}`, null);
      greet();
    }
  }

  async function refresh() {
    if (!conversationId) return;
    try { render(await request('GET', `/api/chat/${encodeURIComponent(conversationId)}?account_id=${account}`)); } catch {}
  }

  async function send(text) {
    if (busy || !text.trim() || !AGENT) return;
    busy = true;
    log.insertAdjacentHTML('beforeend', `<div class="msg msg--user"><p>${esc(text)}</p></div>`);
    log.querySelectorAll('.chat-quick').forEach((q) => q.remove());
    typing(true);
    try {
      const view = await request('POST', '/api/chat', { conversation_id: conversationId, account_id: account, message: text, time_zone: timeZone });
      conversationId = view.conversation_id;
      store.set(`lumora-chat-${account}`, conversationId);
      render(view);
    } catch (e) {
      typing(false);
      showError(e.message || 'Something went wrong. Please try again.');
    } finally {
      busy = false;
    }
  }

  async function decide(cardId, decision, cardEl) {
    if (busy) return;
    busy = true;
    cardEl.querySelectorAll('button').forEach((b) => (b.disabled = true));
    typing(true);
    try {
      render(await request('POST', `/api/chat/${encodeURIComponent(conversationId)}/cards/${encodeURIComponent(cardId)}`, { account_id: account, decision }));
    } catch (e) {
      typing(false);
      showError(e.message);
      cardEl.querySelectorAll('button').forEach((b) => (b.disabled = false));
    } finally {
      busy = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    send(text);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  log.addEventListener('click', (e) => {
    const quick = e.target.closest('[data-quick]');
    if (quick) return send(quick.dataset.quick);
    const btn = e.target.closest('[data-decide]');
    if (btn) {
      const card = btn.closest('[data-card]');
      decide(card.dataset.card, btn.dataset.decide, card);
    }
  });
})();
