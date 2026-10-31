/* Lumora Learning — demo site behaviour (no dependencies) */
(function () {
  document.documentElement.classList.remove('no-js');

  const page = document.body.dataset.page || '';

  /* ---------- Icons and illustrations ---------- */

  const icon = {
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  };

  const logoMark =
    '<svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="#0f5c55"/>' +
    '<path d="M20 9a11 11 0 0 1 0 22" fill="none" stroke="#ffc94d" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M20 31a11 11 0 0 1 0-22" fill="none" stroke="#ff7a59" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 6"/>' +
    '<circle cx="20" cy="20" r="4" fill="#fbf6ee"/></svg>';

  // Simple geometric scenes used instead of photos.
  const arts = {
    learner:
      '<svg viewBox="0 0 200 150" aria-hidden="true"><circle cx="100" cy="58" r="26" fill="#0f5c55"/><path d="M52 150c0-30 22-52 48-52s48 22 48 52z" fill="#ff7a59"/><circle cx="160" cy="34" r="12" fill="#ffc94d"/><rect x="24" y="96" width="34" height="34" rx="8" fill="#fff" opacity=".8"/></svg>',
    family:
      '<svg viewBox="0 0 200 150" aria-hidden="true"><circle cx="66" cy="52" r="22" fill="#0f5c55"/><circle cx="134" cy="52" r="22" fill="#ff7a59"/><circle cx="100" cy="86" r="16" fill="#ffc94d"/><path d="M30 150c0-26 16-46 36-46s36 20 36 46zM98 150c0-26 16-46 36-46s36 20 36 46z" fill="#fff" opacity=".85"/></svg>',
    rocket:
      '<svg viewBox="0 0 200 150" aria-hidden="true"><path d="M100 18c26 18 34 50 24 86H76c-10-36-2-68 24-86z" fill="#fff"/><circle cx="100" cy="62" r="12" fill="#0f5c55"/><path d="M76 104l-16 22 26-8zM124 104l16 22-26-8z" fill="#ff7a59"/><path d="M90 112h20l-10 26z" fill="#ffc94d"/></svg>',
    chart:
      '<svg viewBox="0 0 200 150" aria-hidden="true"><rect x="30" y="20" width="140" height="110" rx="14" fill="#fff"/><rect x="52" y="86" width="20" height="28" rx="5" fill="#ffc94d"/><rect x="82" y="66" width="20" height="48" rx="5" fill="#ff7a59"/><rect x="112" y="44" width="20" height="70" rx="5" fill="#0f5c55"/><circle cx="150" cy="40" r="8" fill="#1f8a7f"/></svg>',
    plan:
      '<svg viewBox="0 0 200 150" aria-hidden="true"><rect x="44" y="16" width="112" height="124" rx="14" fill="#fff"/><rect x="62" y="40" width="76" height="9" rx="4" fill="#0f5c55"/><rect x="62" y="62" width="60" height="9" rx="4" fill="#d9efeb"/><rect x="62" y="84" width="68" height="9" rx="4" fill="#d9efeb"/><circle cx="140" cy="116" r="18" fill="#ff7a59"/><path d="M132 116l6 6 10-12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    wallet:
      '<svg viewBox="0 0 200 150" aria-hidden="true"><rect x="30" y="38" width="140" height="88" rx="16" fill="#0f5c55"/><rect x="118" y="66" width="52" height="32" rx="10" fill="#ffc94d"/><circle cx="136" cy="82" r="6" fill="#0f5c55"/><rect x="48" y="22" width="90" height="26" rx="8" fill="#ff7a59"/></svg>',
    book:
      '<svg viewBox="0 0 200 150" aria-hidden="true"><path d="M100 36c-20-12-46-14-66-8v96c20-6 46-4 66 8z" fill="#fff"/><path d="M100 36c20-12 46-14 66-8v96c-20-6-46-4-66 8z" fill="#ffc94d"/><path d="M100 36v96" stroke="#0f5c55" stroke-width="4"/><path d="M52 54h30M52 70h30M52 86h22" stroke="#d9efeb" stroke-width="6" stroke-linecap="round"/></svg>',
    numbers:
      '<svg viewBox="0 0 200 150" aria-hidden="true"><rect x="26" y="24" width="64" height="64" rx="14" fill="#fff"/><rect x="110" y="24" width="64" height="64" rx="14" fill="#ff7a59"/><rect x="68" y="80" width="64" height="56" rx="14" fill="#ffc94d"/><path d="M50 56h16M58 48v16M134 56h16M92 108h16" stroke="#0f5c55" stroke-width="5" stroke-linecap="round"/></svg>',
    screen:
      '<svg viewBox="0 0 200 150" aria-hidden="true"><rect x="22" y="22" width="156" height="96" rx="12" fill="#fff"/><circle cx="68" cy="66" r="18" fill="#0f5c55"/><rect x="98" y="50" width="60" height="10" rx="5" fill="#ff7a59"/><rect x="98" y="70" width="44" height="10" rx="5" fill="#d9efeb"/><rect x="80" y="122" width="40" height="10" rx="5" fill="#fff" opacity=".7"/></svg>',
    star:
      '<svg viewBox="0 0 200 150" aria-hidden="true"><path d="M100 18l20 42 46 6-34 32 8 46-40-22-40 22 8-46-34-32 46-6z" fill="#ffc94d"/><circle cx="100" cy="82" r="14" fill="#ff7a59"/></svg>',
    pencil:
      '<svg viewBox="0 0 200 150" aria-hidden="true"><rect x="34" y="30" width="96" height="100" rx="12" fill="#fff"/><path d="M54 56h56M54 76h56M54 96h36" stroke="#d9efeb" stroke-width="6" stroke-linecap="round"/><path d="M150 26l18 18-58 58-24 6 6-24z" fill="#ff7a59"/><path d="M150 26l18 18-10 10-18-18z" fill="#0f5c55"/></svg>',
    chat:
      '<svg viewBox="0 0 200 150" aria-hidden="true"><rect x="22" y="24" width="110" height="66" rx="18" fill="#fff"/><path d="M44 90l-6 22 26-22z" fill="#fff"/><rect x="76" y="62" width="104" height="60" rx="18" fill="#0f5c55"/><path d="M158 122l8 18-26-18z" fill="#0f5c55"/><circle cx="108" cy="92" r="5" fill="#ffc94d"/><circle cx="128" cy="92" r="5" fill="#ffc94d"/><circle cx="148" cy="92" r="5" fill="#ffc94d"/><path d="M44 50h66M44 66h42" stroke="#ff7a59" stroke-width="6" stroke-linecap="round"/></svg>',
  };

  document.querySelectorAll('[data-art]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', arts[el.dataset.art] || arts.star);
  });

  /* ---------- Shared header ---------- */

  const gradeLinks = (subject) =>
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      .map((g) => `<li><a href="${g === 1 && subject === 'math' ? 'grade-1-math.html' : subject + '-tutors.html'}">Grade ${g} ${subject}</a></li>`)
      .join('');

  const mega = (subject) => `
    <div class="mega" role="region" aria-label="${subject} tutoring links">
      <div><h4>Elementary</h4><ul>${gradeLinks(subject).split('</li>').slice(0, 4).join('</li>')}</li></ul></div>
      <div><h4>Middle school</h4><ul>${gradeLinks(subject).split('</li>').slice(4, 8).join('</li>')}</li></ul></div>
      <div><h4>Programs</h4><ul>
        <li><a href="${subject}-tutors.html">All ${subject} tutors</a></li>
        <li><a href="worksheets.html">Free worksheets</a></li>
        <li><a href="${subject}-tutors.html#how">How lessons work</a></li>
        <li><a href="pricing.html">Plans &amp; pricing</a></li>
      </ul></div>
      <div class="mega-promo"><strong>New to Lumora?</strong><p>Answer five quick questions and we’ll suggest a tutor and a starting level.</p>
        <button class="btn btn--dark btn--sm" data-book>Take the quiz</button></div>
    </div>`;

  const navLinks = [
    { href: 'index.html', label: 'Home', key: 'home' },
    { href: 'math-tutors.html', label: 'Math tutors', key: 'math', mega: 'math' },
    { href: 'reading-tutors.html', label: 'Reading tutors', key: 'reading', mega: 'reading' },
    { href: 'reviews.html', label: 'Reviews', key: 'reviews' },
    { href: 'pricing.html', label: 'Pricing', key: 'pricing' },
    { href: 'help-center.html', label: 'Help', key: 'help' },
  ];

  const header = document.querySelector('[data-site-header]');
  if (header) {
    header.outerHTML = `
      <div class="demo-note">Demo site for a hackathon prototype. Lumora Learning is a fictional company.</div>
      <header class="site-header">
        <div class="container header-inner">
          <a class="logo" href="index.html">${logoMark}<span>Lumora</span></a>
          <nav class="main-nav" id="main-nav" aria-label="Main">
            ${navLinks
              .filter((l) => l.key !== 'home')
              .map((l) =>
                l.mega
                  ? `<div class="nav-item"><button class="nav-link" aria-expanded="false" ${page === l.key ? 'aria-current="page"' : ''}>${l.label}${icon.chev}</button>${mega(l.mega)}</div>`
                  : `<div class="nav-item"><a class="nav-link" href="${l.href}" ${page === l.key ? 'aria-current="page"' : ''}>${l.label}</a></div>`
              )
              .join('')}
            <div class="btn-row mobile-only"><button class="btn btn--ghost" data-login>Log in</button></div>
          </nav>
          <div class="header-actions">
            <button class="btn btn--ghost btn--sm" data-login>Log in</button>
            <button class="btn btn--primary btn--sm" data-book>Book a free lesson</button>
            <button class="menu-toggle" aria-controls="main-nav" aria-expanded="false" aria-label="Open menu"><span></span><span></span><span></span></button>
          </div>
        </div>
      </header>`;
  }

  /* ---------- Shared footer ---------- */

  const footer = document.querySelector('[data-site-footer]');
  if (footer) {
    footer.outerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-top">
            <div class="footer-brand">
              <a class="logo" href="index.html">${logoMark}<span>Lumora</span></a>
              <p>Friendly 1:1 math and reading tutoring for kids in grades 1–12.</p>
              <div class="footer-contact"><span>hello@lumora.example</span><span>partners@lumora.example</span></div>
              <div class="socials" aria-label="Social profiles (demo)"><span>Fb</span><span>In</span><span>Ig</span><span>Yt</span></div>
            </div>
            <div><h4>Company</h4><ul>
              <li><a href="about.html">About us</a></li><li><a href="reviews.html">Parent reviews</a></li>
              <li><a href="pricing.html">Pricing</a></li><li><a href="blog.html">Blog</a></li><li><a href="help-center.html">Help center</a></li>
            </ul></div>
            <div><h4>Math</h4><ul>
              <li><a href="math-tutors.html">Math tutors</a></li><li><a href="grade-1-math.html">Grade 1 math</a></li>
              <li><a href="math-tutors.html">Algebra help</a></li><li><a href="math-tutors.html">Geometry help</a></li><li><a href="worksheets.html">Math worksheets</a></li>
            </ul></div>
            <div><h4>Reading</h4><ul>
              <li><a href="reading-tutors.html">Reading tutors</a></li><li><a href="reading-tutors.html">Phonics</a></li>
              <li><a href="reading-tutors.html">Comprehension</a></li><li><a href="reading-tutors.html">Writing</a></li><li><a href="worksheets.html">Reading worksheets</a></li>
            </ul></div>
            <div><h4>Legal</h4><ul>
              <li><a href="privacy.html">Privacy policy</a></li><li><a href="privacy.html#terms">Terms of service</a></li><li><a href="privacy.html#cookies">Cookies</a></li>
            </ul></div>
          </div>
          <div class="footer-bottom"><span>© 2026 Lumora Learning (fictional). Built for a hackathon demo.</span><span>Made with care for curious kids.</span></div>
        </div>
      </footer>`;
  }

  /* ---------- Booking modal and toast ---------- */

  document.body.insertAdjacentHTML(
    'beforeend',
    `<dialog class="modal" id="book-modal" aria-labelledby="book-title">
      <div class="modal-body">
        <button class="modal-close" aria-label="Close" data-close>×</button>
        <form method="dialog" novalidate>
          <span class="eyebrow">Free trial lesson</span>
          <h2 id="book-title">Book a free lesson</h2>
          <p class="muted">Tell us a little about your child and we’ll suggest a tutor.</p>
          <div class="field"><label for="bk-grade">Grade</label>
            <select id="bk-grade" required>${['K', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => `<option value="${g}">${g === 'K' ? 'Kindergarten' : 'Grade ' + g}</option>`).join('')}</select></div>
          <div class="field"><label for="bk-subject">Subject</label>
            <select id="bk-subject"><option>Math</option><option>Reading</option><option>Both</option></select></div>
          <div class="field"><label for="bk-email">Parent’s email</label><input id="bk-email" type="email" placeholder="you@example.com" autocomplete="off"></div>
          <button class="btn btn--primary" value="ok">Find my tutor</button>
        </form>
        <div class="modal-success" role="status">
          <h2>You’re on the list!</h2>
          <p class="muted">This is a demo, so nothing was sent. In the real product, a coordinator would reach out within a day.</p>
          <button class="btn btn--dark" data-close>Close</button>
        </div>
      </div>
    </dialog>
    <div class="toast" role="status" aria-live="polite"></div>`
  );

  const modal = document.getElementById('book-modal');
  const toastEl = document.querySelector('.toast');
  let toastTimer;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2800);
  };

  const openBooking = (grade, subject) => {
    modal.classList.remove('is-done');
    if (grade) modal.querySelector('#bk-grade').value = grade;
    if (subject) modal.querySelector('#bk-subject').value = subject;
    modal.showModal();
  };

  modal.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    modal.classList.add('is-done');
  });

  document.addEventListener('click', (e) => {
    const book = e.target.closest('[data-book]');
    if (book) {
      e.preventDefault();
      openBooking(book.dataset.grade, book.dataset.subject);
      return;
    }
    if (e.target.closest('[data-close]')) { modal.close(); return; }
    if (e.target === modal) { modal.close(); return; }
    if (e.target.closest('[data-login]')) { toast('Sign-in is not part of this demo.'); return; }
    if (e.target.closest('[data-toast]')) { e.preventDefault(); toast(e.target.closest('[data-toast]').dataset.toast); }
  });

  /* ---------- Header behaviour ---------- */

  const siteHeader = document.querySelector('.site-header');
  const onScroll = () => siteHeader && siteHeader.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const nav = document.getElementById('main-nav');
  const toggle = document.querySelector('.menu-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      // The demo note above the header shifts it, so start the drawer at the header's real bottom edge.
      if (open) nav.style.top = siteHeader.getBoundingClientRect().bottom + 'px';
      nav.classList.toggle('is-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
  }

  const desktop = window.matchMedia('(min-width: 960px)');
  const closeAllMenus = (except) =>
    document.querySelectorAll('.nav-item.is-open').forEach((item) => {
      if (item === except) return;
      item.classList.remove('is-open');
      item.querySelector('button.nav-link')?.setAttribute('aria-expanded', 'false');
    });

  document.querySelectorAll('.nav-item').forEach((item) => {
    const btn = item.querySelector('button.nav-link');
    if (!btn) return;
    const set = (open) => {
      if (open) closeAllMenus(item);
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', () => set(!item.classList.contains('is-open')));
    let leaveTimer;
    item.addEventListener('mouseenter', () => { if (desktop.matches) { clearTimeout(leaveTimer); set(true); } });
    item.addEventListener('mouseleave', () => { if (desktop.matches) leaveTimer = setTimeout(() => set(false), 120); });
    item.addEventListener('focusout', (e) => { if (desktop.matches && !item.contains(e.relatedTarget)) set(false); });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllMenus(); });
  document.addEventListener('click', (e) => { if (desktop.matches && !e.target.closest('.nav-item')) closeAllMenus(); });

  /* ---------- Sliders ---------- */

  document.querySelectorAll('[data-slider]').forEach((slider) => {
    const track = slider.querySelector('.slider-track');
    slider.insertAdjacentHTML(
      'beforeend',
      `<div class="slider-nav"><button aria-label="Previous">${icon.prev}</button><button aria-label="Next">${icon.next}</button></div>`
    );
    const [prev, next] = slider.querySelectorAll('.slider-nav button');
    const step = () => track.firstElementChild.getBoundingClientRect().width + 24;
    const update = () => {
      prev.disabled = track.scrollLeft < 4;
      next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    };
    prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  document.querySelectorAll('.review .link-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.review');
      const open = card.classList.toggle('is-expanded');
      btn.textContent = open ? 'Show less' : 'Read more';
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  /* ---------- Blog filter and pagination ---------- */

  const blog = document.querySelector('[data-blog]');
  if (blog) {
    const posts = [...blog.querySelectorAll('[data-cat]')];
    const pager = blog.querySelector('.pagination');
    const perPage = 6;
    let cat = 'all';
    let pageNo = 1;
    const render = () => {
      const matches = posts.filter((p) => cat === 'all' || p.dataset.cat === cat);
      const pages = Math.max(1, Math.ceil(matches.length / perPage));
      pageNo = Math.min(pageNo, pages);
      posts.forEach((p) => (p.hidden = true));
      matches.slice((pageNo - 1) * perPage, pageNo * perPage).forEach((p) => (p.hidden = false));
      pager.innerHTML =
        `<button aria-label="Previous page" ${pageNo === 1 ? 'disabled' : ''} data-p="${pageNo - 1}">‹</button>` +
        Array.from({ length: pages }, (_, i) => `<button class="${i + 1 === pageNo ? 'is-active' : ''}" data-p="${i + 1}" ${i + 1 === pageNo ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('') +
        `<button aria-label="Next page" ${pageNo === pages ? 'disabled' : ''} data-p="${pageNo + 1}">›</button>`;
    };
    blog.querySelectorAll('[data-filter]').forEach((chip) =>
      chip.addEventListener('click', () => {
        blog.querySelectorAll('[data-filter]').forEach((c) => { c.classList.remove('is-active'); c.setAttribute('aria-pressed', 'false'); });
        chip.classList.add('is-active');
        chip.setAttribute('aria-pressed', 'true');
        cat = chip.dataset.filter;
        pageNo = 1;
        render();
      })
    );
    pager.addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (!b || b.disabled) return;
      pageNo = Number(b.dataset.p);
      render();
      blog.scrollIntoView({ block: 'start' });
    });
    render();
  }

  /* ---------- Help center search and categories ---------- */

  const help = document.querySelector('[data-help]');
  if (help) {
    const input = document.getElementById('help-search');
    const groups = [...help.querySelectorAll('.faq-group')];
    const empty = help.querySelector('.faq-empty');
    const cats = [...help.querySelectorAll('.faq-cats button')];
    let activeCat = 'all';
    const apply = () => {
      const q = (input?.value || '').trim().toLowerCase();
      let shown = 0;
      groups.forEach((g) => {
        const inCat = activeCat === 'all' || g.dataset.group === activeCat;
        let groupShown = 0;
        g.querySelectorAll('details').forEach((d) => {
          const hit = inCat && (!q || d.textContent.toLowerCase().includes(q));
          d.hidden = !hit;
          if (hit) { groupShown++; if (q) d.open = true; }
        });
        g.hidden = groupShown === 0;
        shown += groupShown;
      });
      empty.style.display = shown ? 'none' : 'block';
    };
    input?.addEventListener('input', apply);
    document.getElementById('help-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      apply();
      help.scrollIntoView({ block: 'start' });
    });
    cats.forEach((b) =>
      b.addEventListener('click', () => {
        cats.forEach((c) => { c.classList.remove('is-active'); c.setAttribute('aria-pressed', 'false'); });
        b.classList.add('is-active');
        b.setAttribute('aria-pressed', 'true');
        activeCat = b.dataset.cat;
        apply();
      })
    );
    document.querySelectorAll('[data-help-topic]').forEach((card) =>
      card.addEventListener('click', (e) => {
        e.preventDefault();
        if (input) input.value = card.dataset.helpTopic;
        activeCat = 'all';
        cats.forEach((c) => c.classList.toggle('is-active', c.dataset.cat === 'all'));
        apply();
        help.scrollIntoView({ block: 'start' });
      })
    );
  }

  /* ---------- Pricing billing toggle ---------- */

  const billing = document.querySelector('[data-billing]');
  if (billing) {
    const buttons = billing.querySelectorAll('button');
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        buttons.forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
        document.querySelectorAll('[data-price-math]').forEach((el) => {
          el.textContent = '$' + (b.dataset.mode === 'both' ? el.dataset.priceBoth : el.dataset.priceMath);
        });
      })
    );
  }

  /* ---------- Grade page self-check ---------- */

  const needs = document.querySelector('[data-needs]');
  if (needs) {
    const out = needs.querySelector('.need-result');
    needs.addEventListener('change', () => {
      const n = needs.querySelectorAll('input:checked').length;
      out.textContent =
        n === 0 ? '' : n < 3 ? `${n} sign${n > 1 ? 's' : ''}: a few weekly practice sessions may be enough.` : `${n} signs: a 1:1 tutor could really help. Try a free lesson.`;
    });
  }

  /* ---------- Legal table of contents ---------- */

  const toc = document.querySelector('.toc');
  if (toc && 'IntersectionObserver' in window) {
    const links = [...toc.querySelectorAll('a')];
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (en.isIntersecting) links.forEach((a) => a.classList.toggle('is-active', a.hash === '#' + en.target.id));
        }),
      { rootMargin: '-30% 0px -60% 0px' }
    );
    document.querySelectorAll('.legal h2[id]').forEach((h) => io.observe(h));
  }

  /* ---------- Reveal on scroll ---------- */

  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } }),
      { rootMargin: '0px 0px -8% 0px' }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- Marquee: duplicate content for a seamless loop ---------- */

  document.querySelectorAll('.marquee-track').forEach((track) => {
    track.innerHTML += track.innerHTML.replace(/<div class="press-logo"/g, '<div class="press-logo" aria-hidden="true"');
  });
})();
