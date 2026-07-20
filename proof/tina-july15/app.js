(() => {
  'use strict';

  const report = window.SALT_REPORT;
  if (!report) return;

  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const diagnosticFallback = {
    title: 'This check needs a completed user result',
    issue: 'The reported workflow did not consistently reach its expected finish.',
    step: 'Repeated the same signed-in member workflow and checked the final screen.',
    result: 'This attempt did not reach a completed on-screen result, so it is not counted as passed.',
    boundary: 'The check stopped before SaltBot showed a completed result.',
    cleanup: 'The dedicated test account was left clean after this check.',
    copy: 'This check did not reach a completed on-screen result.',
  };

  function sanitizeClientText(value = '', context = 'copy') {
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (!text) return '';

    const rawDiagnostic = /playwright|\blocator\b|\bselector\b|waitFor|getByText|call log|timeout\s+\d+ms|stack trace|run[-_ ]?marker|browser diagnostics|terminal screenshot|console error|failed (?:browser )?requests?|HTTP\s+\d{3}/i;
    if (rawDiagnostic.test(text)) return diagnosticFallback[context] || diagnosticFallback.copy;

    return text.replace(/\s+/g, ' ').trim();
  }

  const copy = (value, context = 'copy') => escapeHtml(sanitizeClientText(value, context));
  const status = (key) => report.statuses[key] || report.statuses.failed;
  const taskUrl = (task) => `${report.linearBase}${encodeURIComponent(task)}`;
  const sectionSlug = (section) => String(section).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const statusBadge = (key) => `<span class="status-badge" data-tone="${escapeHtml(status(key).tone)}"><i></i>${copy(status(key).label)}</span>`;

  function imageButton(item, side) {
    const isBefore = side === 'before';
    const src = isBefore ? item.beforeImage : item.afterImage;
    const label = isBefore ? item.beforeLabel : item.afterLabel;
    const caption = sanitizeClientText(isBefore ? item.issue : item.result, isBefore ? 'issue' : 'result');
    return `<button class="media-frame ${isBefore ? 'before' : 'after'}" type="button" data-image="${escapeHtml(src)}" data-caption="${escapeHtml(caption)}" aria-label="${copy(label)}: ${escapeHtml(caption)}. Open an optional larger view.">
      <span>${copy(label)}</span>
      <small>${escapeHtml(caption)}</small>
      <img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}" loading="lazy" decoding="async" />
      <em>Open larger view <span aria-hidden="true">↗</span></em>
    </button>`;
  }

  function stepsBlock(steps) {
    if (!steps || steps.length === 0) return '<p>We followed the reported workflow from its starting point through the visible result.</p>';
    if (steps.length === 1) return `<p>${copy(steps[0], 'step')}</p>`;
    return `<ol class="steps-list">${steps.map((step) => `<li>${copy(step, 'step')}</li>`).join('')}</ol>`;
  }

  function videoBlock(item) {
    return `<div class="proof-video">
      <div class="recording-intro">
        <p class="label">Video walkthrough</p>
        <h4>Watch this item being tested</h4>
        <p>The GIF is a quick preview. Play the video to see the complete test from start to finish.</p>
      </div>
      <figure class="gif-proof">
        <img class="proof-loop" src="${escapeHtml(item.gif)}" alt="Short preview of feedback ${escapeHtml(item.id)} being tested" loading="lazy" decoding="async" />
        <figcaption>Quick GIF preview</figcaption>
      </figure>
      <div class="video-shell">
        <video controls playsinline preload="none" poster="${escapeHtml(item.afterImage)}" data-video-src="${escapeHtml(item.video)}" aria-label="Full recording for feedback ${escapeHtml(item.id)}"></video>
        <button class="load-video" type="button" data-load-video>Load full recording <span aria-hidden="true">▶</span></button>
      </div>
    </div>`;
  }

  function notesBlock(item) {
    const boundary = item.boundary ? sanitizeClientText(item.boundary, 'boundary') : '';
    const cleanup = item.cleanup ? sanitizeClientText(item.cleanup, 'cleanup') : '';
    if (!boundary && !cleanup) return '';

    const boundaryTitle = item.status === 'blocked' ? 'What Tina needs to provide' : 'About this test';
    return `<div class="verification-notes">
      ${boundary ? `<div class="boundary-note" data-blocked="${item.status === 'blocked'}"><span>${escapeHtml(boundaryTitle)}</span><p>${escapeHtml(boundary)}</p></div>` : ''}
      ${cleanup ? `<details class="cleanup-note"><summary>About this test</summary><p>${escapeHtml(cleanup)}</p></details>` : ''}
    </div>`;
  }

  function proofCard(item) {
    return `<article class="proof-story" id="item-${escapeHtml(item.id)}" data-status="${escapeHtml(item.status)}" tabindex="-1">
      <header>
        <div>
          <p class="item-number">${copy(item.section)} · Feedback ${escapeHtml(item.id)}</p>
          <h3>${copy(item.title, 'title')}</h3>
        </div>
        ${statusBadge(item.status)}
      </header>
      <div class="user-path"><span>How this was tested</span>${stepsBlock(item.steps)}</div>
      <div class="before-after">
        ${imageButton(item, 'before')}
        <div class="change-arrow" aria-hidden="true">→</div>
        ${imageButton(item, 'after')}
      </div>
      ${videoBlock(item)}
      ${notesBlock(item)}
      <a class="tracking-link" href="${taskUrl(item.task)}" target="_blank" rel="noreferrer">View the follow-up task <span>↗</span></a>
    </article>`;
  }

  const filterOrder = ['all', 'completed', 'fixed', 'blocked'];
  let activeFilter = 'all';
  let videoObserver;

  function totals() {
    return report.items.reduce((summary, item) => {
      summary[item.status] = (summary[item.status] || 0) + 1;
      return summary;
    }, {});
  }

  function renderSummary() {
    const count = totals();
    const passed = (count.passed || 0) + (count.fixed || 0);
    const cards = [
      { number: report.items.length, label: 'feedback items tested', tone: 'working' },
      { number: passed, label: 'complete and passed', tone: 'verified' },
      { number: count.fixed || 0, label: 'updated and then passed', tone: 'review' },
      { number: count.blocked || 0, label: 'needs Tina’s approved photo', tone: 'waiting' },
      { number: report.items.length, label: 'videos and GIFs', tone: 'verified' },
    ];
    document.querySelector('#summary-counts').innerHTML = cards
      .map((card) => `<div data-tone="${card.tone}"><strong>${card.number}</strong><span>${escapeHtml(card.label)}</span></div>`)
      .join('');
  }

  function reportGroups() {
    return report.items.reduce((groups, item) => {
      const previous = groups.at(-1);
      if (!previous || previous.name !== item.section) groups.push({ name: item.section, items: [item] });
      else previous.items.push(item);
      return groups;
    }, []);
  }

  function renderIndex() {
    const groups = reportGroups();
    document.querySelector('#section-jumps').innerHTML = groups.map((group) => {
      const first = group.items[0].id;
      const last = group.items.at(-1).id;
      return `<a href="#group-${sectionSlug(group.name)}"><span>${escapeHtml(first)}–${escapeHtml(last)}</span>${copy(group.name)}</a>`;
    }).join('');

    document.querySelector('#results-index-list').innerHTML = groups.map((group) => `<section class="index-group" aria-labelledby="index-${sectionSlug(group.name)}">
      <h3 id="index-${sectionSlug(group.name)}">${copy(group.name)}</h3>
      <ol>${group.items.map((item) => `<li>
        <a href="#item-${escapeHtml(item.id)}" title="${copy(item.title, 'title')}" aria-label="Feedback ${escapeHtml(item.id)}: ${copy(item.title, 'title')} — ${copy(status(item.status).short)}">
          <span>${escapeHtml(item.id)}</span>
          <strong>${copy(item.title, 'title')}</strong>
          <i data-tone="${escapeHtml(status(item.status).tone)}" aria-label="${copy(status(item.status).short)}"></i>
        </a>
      </li>`).join('')}</ol>
    </section>`).join('');
  }

  function filterLabel(key, count) {
    if (key === 'all') return `All ${report.items.length}`;
    if (key === 'completed') return `Complete · ${(count.passed || 0) + (count.fixed || 0)}`;
    if (key === 'fixed') return `Updated and passed · ${count.fixed || 0}`;
    return `Needs Tina’s photo · ${count.blocked || 0}`;
  }

  function renderFilters() {
    const count = totals();
    document.querySelector('#status-filters').innerHTML = filterOrder.map((key) =>
      `<button type="button" data-filter="${key}" aria-pressed="${key === activeFilter}">${escapeHtml(filterLabel(key, count))}</button>`,
    ).join('');
  }

  function matchesFilter(item) {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'completed') return item.status === 'passed' || item.status === 'fixed';
    return item.status === activeFilter;
  }

  function prepareVideo(video) {
    if (!video || video.dataset.loaded === 'true') return;
    const source = document.createElement('source');
    source.src = video.dataset.videoSrc;
    source.type = 'video/mp4';
    video.append(source);
    video.dataset.loaded = 'true';
  }

  function observeVideos() {
    if (videoObserver) videoObserver.disconnect();
    const videos = document.querySelectorAll('video[data-video-src]');
    if (!('IntersectionObserver' in window)) return;
    videoObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        prepareVideo(entry.target);
        videoObserver.unobserve(entry.target);
      });
    }, { rootMargin: '420px 0px' });
    videos.forEach((video) => videoObserver.observe(video));
  }

  function renderProof() {
    const items = report.items.filter(matchesFilter);
    let previousSection = '';
    document.querySelector('#proof-list').innerHTML = items.map((item) => {
      const divider = activeFilter === 'all' && item.section !== previousSection
        ? `<div class="section-divider" id="group-${sectionSlug(item.section)}" tabindex="-1"><span>${copy(item.section)}</span><i></i></div>`
        : '';
      previousSection = item.section;
      return divider + proofCard(item);
    }).join('');
    document.querySelector('#empty-state').hidden = items.length > 0;
    observeVideos();
  }

  function renderBlockers() {
    const blocked = report.items.filter((item) => item.status === 'blocked');
    document.querySelector('#blocker-list').innerHTML = blocked.map((item) => `<article>
      <span>Feedback ${escapeHtml(item.id)}</span>
      <h3>${copy(item.title, 'title')}</h3>
      <p>${copy(item.boundary || item.result, 'boundary')}</p>
      <a href="#item-${escapeHtml(item.id)}">See the boundary proof ↑</a>
    </article>`).join('');
  }

  function alignToLocationHash({ focus = false, behavior = 'auto' } = {}) {
    if (!location.hash.startsWith('#item-') && !location.hash.startsWith('#group-')) return;
    const target = document.querySelector(location.hash);
    if (!target) return;
    target.scrollIntoView({ behavior, block: 'start' });
    if (focus) target.focus({ preventScroll: true });
  }

  function settleInitialDeepLink() {
    if (!location.hash) return;
    let focused = false;
    const realign = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      alignToLocationHash({ focus: !focused });
      focused = true;
    }));

    realign();
    [120, 420, 900, 1800, 3000].forEach((delay) => window.setTimeout(realign, delay));
    document.querySelectorAll('#proof-list img').forEach((image) => {
      if (!image.complete) image.addEventListener('load', realign, { once: true });
    });
    if (document.fonts?.ready) {
      document.fonts.ready.then(realign).catch(() => {});
    }
    window.addEventListener('load', realign, { once: true });
  }

  const sectionNavigation = document.querySelector('.site-header nav');
  const sectionNavigationLinks = Array.from(sectionNavigation.querySelectorAll('a[href^="#"]'));
  let activeSectionHref = '';
  let sectionNavigationFrame = 0;

  function syncSectionNavigation() {
    sectionNavigationFrame = 0;
    const headerBottom = document.querySelector('.site-header').getBoundingClientRect().bottom;
    let activeLink = null;

    sectionNavigationLinks.forEach((link) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target && target.getBoundingClientRect().top <= headerBottom + 28) activeLink = link;
    });

    sectionNavigationLinks.forEach((link) => {
      if (link === activeLink) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });

    const nextHref = activeLink?.getAttribute('href') || '';
    if (!activeLink || nextHref === activeSectionHref || sectionNavigation.scrollWidth <= sectionNavigation.clientWidth) {
      activeSectionHref = nextHref;
      return;
    }

    activeSectionHref = nextHref;
    const left = activeLink.offsetLeft - ((sectionNavigation.clientWidth - activeLink.offsetWidth) / 2);
    sectionNavigation.scrollTo({
      left: Math.max(0, left),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  function queueSectionNavigationSync() {
    if (sectionNavigationFrame) return;
    sectionNavigationFrame = requestAnimationFrame(syncSectionNavigation);
  }

  window.addEventListener('hashchange', () => {
    alignToLocationHash({ focus: true });
    queueSectionNavigationSync();
    window.setTimeout(queueSectionNavigationSync, 100);
  });
  window.addEventListener('scroll', queueSectionNavigationSync, { passive: true });
  window.addEventListener('resize', queueSectionNavigationSync);

  document.querySelector('#status-filters').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    activeFilter = button.dataset.filter;
    renderFilters();
    renderProof();
  });

  document.body.addEventListener('pointerdown', (event) => {
    const video = event.target.closest('video[data-video-src]');
    if (!video || video.dataset.ready === 'true') return;
    prepareVideo(video);
    video.dataset.ready = 'true';
    video.load();
  });

  document.body.addEventListener('click', (event) => {
    const loadButton = event.target.closest('[data-load-video]');
    if (loadButton) {
      const video = loadButton.closest('.video-shell').querySelector('video');
      prepareVideo(video);
      video.dataset.ready = 'true';
      loadButton.hidden = true;
      video.load();
      video.play().catch(() => {});
      return;
    }

    const proofLink = event.target.closest('a[href^="#item-"], a[href^="#group-"]');
    if (!proofLink) return;
    event.preventDefault();
    if (activeFilter !== 'all') {
      activeFilter = 'all';
      renderFilters();
      renderProof();
    }
    requestAnimationFrame(() => {
      const target = document.querySelector(proofLink.getAttribute('href'));
      if (!target) return;
      history.pushState(null, '', proofLink.getAttribute('href'));
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      target.focus({ preventScroll: true });
    });
  });

  const dialog = document.querySelector('#image-dialog');
  const dialogImage = dialog.querySelector('img');
  const dialogCaption = dialog.querySelector('p');
  const dialogClose = dialog.querySelector('button');

  document.body.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-image]');
    if (!trigger) return;
    dialogImage.src = trigger.dataset.image;
    dialogImage.alt = trigger.dataset.caption;
    dialogCaption.textContent = trigger.dataset.caption;
    dialog.showModal();
  });
  dialogClose.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { dialogImage.src = ''; });

  document.querySelector('#source-doc').href = report.sourceDocUrl;
  renderSummary();
  renderIndex();
  renderFilters();
  renderProof();
  renderBlockers();
  settleInitialDeepLink();
  queueSectionNavigationSync();
})();
