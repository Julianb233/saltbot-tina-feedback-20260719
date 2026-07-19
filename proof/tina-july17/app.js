(() => {
  "use strict";

  const report = window.SALT_REPORT;
  const reportShell = document.querySelector("#report-shell");
  const releaseGate = document.querySelector("#release-gate");
  const expectedIds = [
    "DASH-01", "DASH-02", "DASH-03", "DASH-04", "ONB-01", "BRAND-01", "BRAND-02",
    "CHAT-01", "CHAT-02", "CHAT-03", "CHAT-04", "CHAT-05", "CHAT-06", "CHAT-07",
    "SOC-01", "SOC-02", "SOC-03", "SOC-04", "SOC-05",
    "SCHED-01", "SCHED-02", "SCHED-03", "SCHED-04", "SCHED-05", "SCHED-06", "SCHED-07",
    "DMA-01", "DMI-01", "DMI-02", "DMI-03", "LIST-01", "IGA-01",
    "CAR-01", "CAR-02", "CAR-03", "CAR-04", "CAR-05", "SELF-01", "SELF-02",
  ];
  const expectedFollowups = [
    ["R2-01", "AI-13135"], ["R2-02", "AI-13136"], ["R2-03", "AI-13137"],
    ["R2-04", "AI-13138"], ["R2-05", "AI-13139"], ["R2-06", "AI-13140"],
    ["R2-07", "AI-13141"], ["R2-08", "AI-13142"], ["R2-09", "AI-13143"],
    ["R2-10", "AI-13144"], ["R2-11", "AI-13145"], ["R2-12", "AI-13146"],
    ["R2-13", "AI-13147"],
  ];
  const expectedIosRevision = "ba97fa63d2764df53ee8ad5ad3aa0d87f6b406dc";
  const expectedIosFullJourneyRevision = "36adae641e551262421917896d4f786458043ca8";
  const expectedIosFinalCandidateRevision = "f7499696ba0edd39186355d0b23cdf70ad2ca6f4";

  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function sanitizeClientText(value = "") {
    const text = String(value).replace(/\s+/g, " ").trim();
    if (!text) return "";
    const rawDiagnostic = /playwright|locator|selector|waitFor|getByText|stack trace|console log|terminal|HTTP\s+\d{3}|raw response|auth token|database row|localStorage|sessionStorage/i;
    if (rawDiagnostic.test(text)) return "This detail is available in the matching follow-up task.";
    return text;
  }

  const copy = (value) => escapeHtml(sanitizeClientText(value));
  const sectionSlug = (section) => String(section).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const taskUrl = (task) => `${report.linearBase}${encodeURIComponent(task)}`;
  const mediaPlaceholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 10'%3E%3Crect width='16' height='10' fill='%23eee8e1'/%3E%3C/svg%3E";

  function completedAt(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      const [year, month, day] = String(value).split("-").map(Number);
      return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(year, month - 1, day));
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return sanitizeClientText(value);
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Los_Angeles",
    }).format(date);
  }

  function showGate(message) {
    reportShell.hidden = true;
    releaseGate.hidden = false;
    const description = releaseGate.querySelector("p:not(.eyebrow)");
    if (description && message) description.textContent = message;
    document.body.dataset.reportReady = "false";
  }

  function reportErrors() {
    if (!report || !Array.isArray(report.items) || !Array.isArray(report.followups)) return ["The report inventory is unavailable."];
    const errors = [];
    const itemIds = report.items.map((item) => item.id);
    if (report.readyForReview !== true) errors.push("The report has not been approved for client review.");
    if (report.updated !== "July 19, 2026") errors.push("The report date is not current.");
    if (report.iosTestedRevision !== expectedIosRevision) errors.push("The current iPhone review version is not identified.");
    if (report.iosFullJourneyRevision !== expectedIosFullJourneyRevision) errors.push("The complete iPhone member journey is not identified.");
    if (report.iosFinalCandidateRevision !== expectedIosFinalCandidateRevision) errors.push("The final iPhone candidate is not identified.");
    if (report.iosCurrentSourceRevision !== expectedIosFinalCandidateRevision) errors.push("The current iPhone source does not match the final candidate.");
    if (itemIds.length !== expectedIds.length || itemIds.some((id, index) => id !== expectedIds[index])) {
      errors.push("The feedback inventory is incomplete or out of order.");
    }
    if (new Set(report.items.map((item) => item.task)).size !== report.items.length) {
      errors.push("Each feedback point must have its own follow-up task.");
    }
    if (report.followups.length !== expectedFollowups.length || report.followups.some((item, index) => (
      item.id !== expectedFollowups[index][0]
      || item.task !== expectedFollowups[index][1]
      || item.linearIssue !== expectedFollowups[index][1]
    ))) {
      errors.push("The latest follow-up inventory is incomplete or out of order.");
    }
    if (new Set(report.followups.map((item) => item.task)).size !== report.followups.length) {
      errors.push("Each latest follow-up must have its own Linear task.");
    }

    const outcomes = new Set(Object.keys(report.outcomes || {}));
    const requiredText = ["title", "issue", "result", "testedAt", "revision", "accountBoundary", "proofUrl", "beforeImage", "afterImage", "gif", "video"];
    report.items.forEach((item) => {
      if (!outcomes.has(item.outcome)) errors.push(`${item.id} does not have a completed result.`);
      if (!Array.isArray(item.steps) || item.steps.length === 0) errors.push(`${item.id} does not include the completed member journey.`);
      requiredText.forEach((field) => {
        if (typeof item[field] !== "string" || !item[field].trim()) errors.push(`${item.id} is missing ${field}.`);
      });
      if (["deferred", "protected", "approval"].includes(item.outcome) && (!item.boundary || !String(item.boundary).trim())) {
        errors.push(`${item.id} does not explain the review boundary.`);
      }
      if (item.proofUrl && !/^https:\/\//i.test(item.proofUrl)) errors.push(`${item.id} needs a browser-openable proof address.`);
      if (item.video && !/\.mp4(?:$|\?)/i.test(item.video)) errors.push(`${item.id} needs an MP4 recording.`);
      if (item.gif && !/\.gif(?:$|\?)/i.test(item.gif)) errors.push(`${item.id} needs a GIF preview.`);
    });
    const followupRequiredText = ["title", "issue", "result", "accountBoundary", "proofUrl", "beforeImage", "afterImage", "gif", "video", "mediaNote"];
    report.followups.forEach((item) => {
      if (!outcomes.has(item.outcome)) errors.push(`${item.id} does not have a clear review status.`);
      if (item.outcome === "open") errors.push(`${item.id} still has an unfinished result.`);
      if (!Array.isArray(item.steps) || item.steps.length === 0) errors.push(`${item.id} does not explain what was checked.`);
      followupRequiredText.forEach((field) => {
        if (typeof item[field] !== "string" || !item[field].trim()) errors.push(`${item.id} is missing ${field}.`);
      });
      if (["open", "approval", "protected"].includes(item.outcome) && (!item.boundary || !String(item.boundary).trim())) {
        errors.push(`${item.id} does not explain why it remains open or protected.`);
      }
      if (item.proofUrl && !/^https:\/\//i.test(item.proofUrl)) errors.push(`${item.id} needs a browser-openable proof address.`);
      if (item.video && !/\.mp4(?:$|\?)/i.test(item.video)) errors.push(`${item.id} needs an MP4 recording.`);
      if (item.gif && !/\.gif(?:$|\?)/i.test(item.gif)) errors.push(`${item.id} needs a GIF preview.`);
    });
    return errors;
  }

  if (!report) {
    showGate("This report is unavailable and has not been shared as a completed review.");
    return;
  }

  document.querySelector("#gate-source-link").href = report.sourceDocUrl;
  document.querySelector("#report-date").textContent = report.updated;
  const errors = reportErrors();
  if (errors.length > 0) {
    showGate("Nothing is presented as finished until every user check and visual record is complete and available on this page.");
    return;
  }

  releaseGate.hidden = true;
  reportShell.hidden = false;
  document.body.dataset.reportReady = "true";

  const outcome = (item) => report.outcomes[item.outcome];
  const outcomeBadge = (item) => `<span class="outcome-badge" data-tone="${escapeHtml(outcome(item).tone)}"><i></i>${copy(outcome(item).label)}</span>`;

  function totals() {
    return report.items.reduce((summary, item) => {
      summary[item.outcome] = (summary[item.outcome] || 0) + 1;
      return summary;
    }, {});
  }

  function renderSummary() {
    const count = totals();
    const completed = (count.fixed || 0) + (count.passed || 0) + (count.positive || 0);
    const safelyVerified = count.protected || 0;
    const approvalRequired = count.approval || 0;
    const paused = count.deferred || 0;
    document.querySelector("#summary-copy").textContent = `All ${report.items.length + report.followups.length} feedback points have an individual plain-English result and visual record: ${report.items.length} from Tina’s original review and ${report.followups.length} from her newest follow-up. In the original review, ${completed} completed the full allowed member journey, ${safelyVerified} were checked until the next step would have changed a live account, ${approvalRequired} passed inside SaltBot and still need release approval plus a connected-account check, and ${paused} remains paused at Tina’s request.`;
    const cards = [
      [report.items.length, "feedback points documented", "total"],
      [completed, "completed member journeys", "passed"],
      [count.fixed || 0, "updated and passed", "fixed"],
      [safelyVerified, "checks stopped safely", "protected"],
      [approvalRequired, "release approval required", "approval"],
      [paused, "paused at Tina’s request", "deferred"],
    ];
    document.querySelector("#summary-counts").innerHTML = cards.map(([number, label, tone]) =>
      `<div data-tone="${tone}"><strong>${number}</strong><span>${escapeHtml(label)}</span></div>`,
    ).join("");
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
    document.querySelector("#section-jumps").innerHTML = groups.map((group) =>
      `<a href="#group-${sectionSlug(group.name)}"><span>${group.items.length}</span>${copy(group.name)}</a>`,
    ).join("");

    document.querySelector("#index-list").innerHTML = groups.map((group) => `<section class="index-group" aria-labelledby="index-${sectionSlug(group.name)}">
      <h3 id="index-${sectionSlug(group.name)}">${copy(group.name)}</h3>
      <ol>${group.items.map((item) => `<li>
        <a href="#item-${escapeHtml(item.id)}">
          <span>${escapeHtml(item.id)}</span>
          <strong>${copy(item.title)}</strong>
          <i data-tone="${escapeHtml(outcome(item).tone)}" aria-label="${copy(outcome(item).short)}"></i>
        </a>
      </li>`).join("")}</ol>
    </section>`).join("");

    document.querySelector("#item-rail-links").innerHTML = groups.map((group) => `<section>
      <span>${copy(group.name)}</span>
      ${group.items.map((item) => `<a href="#item-${escapeHtml(item.id)}" title="${copy(item.title)}"><b>${escapeHtml(item.id)}</b><em>${copy(item.title)}</em></a>`).join("")}
    </section>`).join("");
  }

  function stepsBlock(item) {
    return `<ol class="steps-list">${item.steps.map((step) => `<li>${copy(step)}</li>`).join("")}</ol>`;
  }

  function mediaPanel(item, side, labels = {}) {
    const isBefore = side === "before";
    const src = isBefore ? item.beforeImage : item.afterImage;
    const heading = isBefore
      ? (labels.before || "What Tina reported")
      : (labels.after || "What the user check showed");
    const caption = isBefore ? item.issue : item.result;
    return `<figure class="media-panel ${side}" data-proof-id="${escapeHtml(item.id)}">
      <figcaption><span>${heading}</span><p>${copy(caption)}</p></figcaption>
      <button type="button" data-image="${escapeHtml(src)}" data-caption="${copy(caption)}" aria-label="${heading}: ${copy(caption)}. Open an optional larger view.">
        <img src="${escapeHtml(src)}" alt="${copy(caption)}" loading="lazy" decoding="async" />
        <em>Open larger view <span aria-hidden="true">↗</span></em>
      </button>
    </figure>`;
  }

  function recordingBlock(item, presentation = {}) {
    const label = presentation.label || "Focused walkthrough";
    const heading = presentation.heading || "See the complete user check";
    const description = presentation.description || "The short preview and video player are already visible. Select play to follow the complete path.";
    return `<section class="recording-block" aria-label="Recording for ${escapeHtml(item.id)}">
      <div class="recording-copy">
        <p class="label">${copy(label)}</p>
        <h4>${copy(heading)}</h4>
        <p>${copy(description)}</p>
      </div>
      <figure class="gif-shell">
        <img class="proof-loop" src="${mediaPlaceholder}" data-gif-src="${escapeHtml(item.gif)}" alt="Short preview of ${copy(item.title)}" loading="lazy" decoding="async" />
        <figcaption>Short preview</figcaption>
      </figure>
      <div class="video-shell">
        <video controls playsinline preload="none" poster="${escapeHtml(item.afterImage)}" data-video-src="${escapeHtml(item.video)}" aria-label="Full recording for ${copy(item.title)}"></video>
      </div>
    </section>`;
  }

  function followupTotals() {
    return report.followups.reduce((summary, item) => {
      summary[item.outcome] = (summary[item.outcome] || 0) + 1;
      return summary;
    }, {});
  }

  function followupCard(item) {
    const isOpen = item.outcome === "open";
    const needsApproval = item.outcome === "approval";
    const isProtected = item.outcome === "protected";
    const boundaryHeading = needsApproval
      ? "Why release approval is required"
      : isProtected
        ? "Why this check stopped safely"
        : "What remains before this can close";
    const boundary = (isOpen || needsApproval || isProtected) && item.boundary
      ? `<aside class="boundary-note" data-tone="${escapeHtml(item.outcome)}"><strong>${boundaryHeading}</strong><p>${copy(item.boundary)}</p></aside>`
      : "";
    const relatedProof = item.id === "R2-02"
      ? `<a class="related-proof-link" href="#release-iphone-current">See the current iPhone calendar proof <span aria-hidden="true">↓</span></a>`
      : "";
    const recordingPresentation = isOpen
      ? {
        label: "Available related recording",
        heading: "What this media proves—and what it does not",
        description: item.mediaNote,
      }
      : needsApproval
        ? {
          label: "Private scheduling record",
          heading: "The safe publishing check is visible here",
          description: item.mediaNote,
        }
        : isProtected
          ? {
            label: "Safeguarded user record",
            heading: "See where the account-safe review stopped",
            description: item.mediaNote,
          }
          : {
            label: "Visual user record",
            heading: "See the result at useful size",
            description: item.mediaNote,
          };
    const afterLabel = isOpen
      ? "What is confirmed so far"
      : needsApproval
        ? "Safe private result"
        : isProtected
          ? "Account-safe result"
          : "Verified result";
    return `<article class="proof-card followup-card" id="followup-${escapeHtml(item.id)}" tabindex="-1">
      <header>
        <div><p class="item-kicker">${copy(item.section)} · ${escapeHtml(item.id)} · ${escapeHtml(item.linearIssue)}</p><h3>${copy(item.title)}</h3></div>
        ${outcomeBadge(item)}
      </header>
      <section class="followup-result" data-tone="${escapeHtml(outcome(item).tone)}">
        <span>Current status</span>
        <p>${copy(item.result)}</p>
      </section>
      <section class="user-path"><div><span>What was checked</span><small>Reviewed ${copy(completedAt(item.testedAt))}</small></div>${stepsBlock(item)}</section>
      <div class="before-after">
        ${mediaPanel(item, "before", { before: "What Tina experienced", after: afterLabel })}
        <div class="change-arrow" aria-hidden="true">→</div>
        ${mediaPanel(item, "after", { before: "What Tina experienced", after: afterLabel })}
      </div>
      ${recordingBlock(item, recordingPresentation)}
      ${relatedProof}
      ${boundary}
      <details class="test-note"><summary>About this review record</summary><p>${copy(item.cleanup)}</p></details>
      <footer class="evidence-links">
        <p><strong>Account boundary</strong><span>${copy(item.accountBoundary)}</span></p>
        <a href="${escapeHtml(item.proofUrl)}">Open this exact item <span aria-hidden="true">↗</span></a>
        <a href="${taskUrl(item.linearIssue)}" target="_blank" rel="noreferrer">View ${escapeHtml(item.linearIssue)} <span aria-hidden="true">↗</span></a>
      </footer>
    </article>`;
  }

  function renderLatestFollowups() {
    const count = followupTotals();
    const verified = (count.fixed || 0) + (count.passed || 0) + (count.positive || 0);
    const cards = [
      [report.followups.length, "new points tracked", "total"],
      [verified, "verified results", "fixed"],
      [count.protected || 0, "protected account checks", "protected"],
      [count.approval || 0, "release approval needed", "approval"],
    ];
    document.querySelector("#latest-counts").innerHTML = cards.map(([number, label, tone]) =>
      `<div data-tone="${tone}"><strong>${number}</strong><span>${escapeHtml(label)}</span></div>`,
    ).join("");
    document.querySelector("#followup-jumps").innerHTML = report.followups.map((item) =>
      `<a href="#followup-${escapeHtml(item.id)}"><span>${escapeHtml(item.id)}</span><strong>${copy(item.title)}</strong><i data-tone="${escapeHtml(outcome(item).tone)}" aria-label="${copy(outcome(item).short)}"></i></a>`,
    ).join("");
    document.querySelector("#followup-list").innerHTML = report.followups.map(followupCard).join("");
  }

  function proofCard(item) {
    const needsApproval = item.outcome === "approval";
    const boundaryHeading = item.outcome === "approval"
      ? "Why release approval is required"
      : item.outcome === "protected"
        ? "About this safeguarded check"
        : "About this review";
    const boundary = ["deferred", "protected", "approval"].includes(item.outcome) && item.boundary
      ? `<aside class="boundary-note" data-tone="${escapeHtml(item.outcome)}"><strong>${boundaryHeading}</strong><p>${copy(item.boundary)}</p></aside>`
      : "";
    const reviewVerb = ["fixed", "passed", "positive"].includes(item.outcome) ? "Completed" : "Reviewed";
    const afterLabel = needsApproval
      ? "Private SaltBot result"
      : item.outcome === "protected"
        ? "Safeguarded result"
        : "What the user check showed";
    const recordingPresentation = needsApproval
      ? {
        label: "Private scheduling record",
        heading: "What this check proves—and what it does not",
        description: "This recording shows SaltBot’s private scheduling step. It does not show a chosen-time post or Story reaching Instagram.",
      }
      : {};
    const cleanup = item.cleanup
      ? `<details class="test-note"><summary>About this user check</summary><p>${copy(item.cleanup)}</p></details>`
      : "";
    return `<article class="proof-card" id="item-${escapeHtml(item.id)}" tabindex="-1">
      <header>
        <div><p class="item-kicker">${copy(item.section)} · ${escapeHtml(item.id)}</p><h3>${copy(item.title)}</h3></div>
        ${outcomeBadge(item)}
      </header>
      <section class="user-path"><div><span>How this was checked</span><small>${reviewVerb} ${copy(completedAt(item.testedAt))} Pacific time</small></div>${stepsBlock(item)}</section>
      <div class="before-after">
        ${mediaPanel(item, "before")}
        <div class="change-arrow" aria-hidden="true">→</div>
        ${mediaPanel(item, "after", { after: afterLabel })}
      </div>
      ${recordingBlock(item, recordingPresentation)}
      ${boundary}${cleanup}
      <footer class="evidence-links">
        <p><strong>Account used</strong><span>${copy(item.accountBoundary)}</span></p>
        <a href="${escapeHtml(item.proofUrl)}" target="_blank" rel="noreferrer">Open this result <span aria-hidden="true">↗</span></a>
        <a href="${taskUrl(item.task)}" target="_blank" rel="noreferrer">View ${escapeHtml(item.task)} <span aria-hidden="true">↗</span></a>
      </footer>
    </article>`;
  }

  function renderProof() {
    let previousSection = "";
    document.querySelector("#proof-list").innerHTML = report.items.map((item) => {
      const divider = item.section !== previousSection
        ? `<div class="section-divider" id="group-${sectionSlug(item.section)}" tabindex="-1"><span>${copy(item.section)}</span><i></i></div>`
        : "";
      previousSection = item.section;
      return divider + proofCard(item);
    }).join("");
  }

  function prepareVideo(video) {
    if (!video || video.dataset.loaded === "true") return;
    const source = document.createElement("source");
    source.src = video.dataset.videoSrc;
    source.type = "video/mp4";
    video.append(source);
    video.dataset.loaded = "true";
    video.load();
  }

  function prepareGif(image) {
    if (!image || image.dataset.loaded === "true") return;
    image.src = image.dataset.gifSrc;
    image.dataset.loaded = "true";
  }

  function observeRecordings() {
    const videos = document.querySelectorAll("video[data-video-src]");
    const gifs = document.querySelectorAll("img[data-gif-src]");
    if (!("IntersectionObserver" in window)) {
      videos.forEach(prepareVideo);
      gifs.forEach(prepareGif);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (entry.target.matches("video")) prepareVideo(entry.target);
        else prepareGif(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "480px 0px" });
    videos.forEach((video) => observer.observe(video));
    gifs.forEach((gif) => observer.observe(gif));
  }

  function guardMedia() {
    document.querySelectorAll(".proof-card img, .proof-card video, .followup-card img, .followup-card video, .release-proof-card img, .release-proof-card video").forEach((media) => {
      media.addEventListener("error", () => showGate("A visual record could not be opened, so this report is not being presented as complete."), { once: true });
    });
  }

  function alignToHash(shouldFocus = false) {
    if (!location.hash) return;
    const target = document.querySelector(location.hash);
    if (!target) return;
    if (shouldFocus && target instanceof HTMLElement) target.focus({ preventScroll: true });
    const behavior = shouldFocus || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    target.scrollIntoView({ block: "start", behavior });
  }

  function settleInitialDeepLink() {
    if (!location.hash) return;
    [0, 140, 500, 1100].forEach((delay, index) => window.setTimeout(() => alignToHash(index === 3), delay));
    document.fonts?.ready.then(() => alignToHash(false)).catch(() => {});
  }

  const headerLinks = Array.from(document.querySelectorAll(".site-header nav a[href^='#']"));
  function syncHeaderNavigation() {
    const headerBottom = document.querySelector(".site-header").getBoundingClientRect().bottom;
    let current = null;
    headerLinks.forEach((link) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (target && target.getBoundingClientRect().top <= headerBottom + 36) current = link;
    });
    headerLinks.forEach((link) => link === current ? link.setAttribute("aria-current", "location") : link.removeAttribute("aria-current"));
    current?.scrollIntoView({ block: "nearest", inline: "center" });
  }

  document.body.addEventListener("click", (event) => {
    const reportLink = event.target.closest("a[href^='#']:not([href='#'])");
    if (reportLink) {
      event.preventDefault();
      history.pushState(null, "", `${location.pathname}${location.search}${reportLink.getAttribute("href")}`);
      alignToHash(true);
    }
  });

  const dialog = document.querySelector("#image-dialog");
  const dialogImage = dialog.querySelector("img");
  const dialogCaption = dialog.querySelector("p");
  document.body.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-image]");
    if (!trigger) return;
    dialogImage.src = trigger.dataset.image;
    dialogImage.alt = trigger.dataset.caption;
    dialogCaption.textContent = trigger.dataset.caption;
    dialog.showModal();
  });
  dialog.querySelector("button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => { dialogImage.src = ""; });

  window.addEventListener("hashchange", () => alignToHash(true));
  window.addEventListener("scroll", syncHeaderNavigation, { passive: true });
  window.addEventListener("resize", syncHeaderNavigation);

  document.querySelector("#source-doc").href = report.sourceDocUrl;
  document.querySelector("#newest-source-doc").href = report.followupSourceDocUrl;
  document.querySelector("#followup-source-doc").href = report.followupSourceDocUrl;
  renderSummary();
  renderLatestFollowups();
  renderIndex();
  renderProof();
  guardMedia();
  observeRecordings();
  settleInitialDeepLink();
  syncHeaderNavigation();
})();
