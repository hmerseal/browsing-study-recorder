importScripts("config.js");

// All writes go through one queue so events are never lost to overlapping writes.
let queue = Promise.resolve();
function enqueue(fn) {
  const next = queue.then(fn);
  queue = next.catch((err) => console.error(err));
  return next;
}

async function getSession() {
  const { session } = await chrome.storage.local.get("session");
  return session || null;
}

async function saveSession(session) {
  await chrome.storage.local.set({ session });
}

// Distinct pages that count toward the minimum.
function countedPages(s) {
  const seen = new Set();
  for (const e of s.events) {
    if (e.type !== "pageview" || e.excluded) continue;
    if (e.site === "search_engine" || e.search_engine) continue;
    if (e.site === "wikipedia" && e.namespace !== null && e.namespace !== undefined && e.namespace < 0) continue;
    seen.add(e.article || e.url);
  }
  return seen.size;
}

function finishState(s) {
  const pages = countedPages(s);
  const waiveMins = CONFIG.MIN_PAGES_WAIVED_AFTER_MINUTES;
  const waived = waiveMins !== null && Date.now() - s.startedAt >= waiveMins * 60000;
  return { pages, canFinish: pages >= CONFIG.MIN_PAGES || waived, waived: waived && pages < CONFIG.MIN_PAGES };
}

function summarize(s) {
  if (!s) return { status: "idle", minPages: CONFIG.MIN_PAGES };
  const f = finishState(s);
  return {
    status: s.status,
    pid: s.pid,
    condition: s.condition,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    endReason: s.endReason,
    pageCount: f.pages,
    minPages: CONFIG.MIN_PAGES,
    canFinish: f.canFinish,
    waiveMinutes: CONFIG.MIN_PAGES_WAIVED_AFTER_MINUTES,
    eventCount: s.events.length,
    exported: !!s.exportedAt,
    now: Date.now()
  };
}

async function updateBadge() {
  const s = await getSession();
  if (!s) {
    await chrome.action.setBadgeText({ text: "" });
  } else if (s.status === "active") {
    await chrome.action.setBadgeBackgroundColor({ color: "#c62828" });
    await chrome.action.setBadgeText({ text: "REC" });
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: "#2e7d32" });
    await chrome.action.setBadgeText({ text: "DONE" });
  }
}

function startSession({ pid, cond, method }) {
  return enqueue(async () => {
    const existing = await getSession();
    if (existing && existing.status === "active") return { ...summarize(existing), already: "active" };
    if (existing && existing.status === "complete") return { ...summarize(existing), already: "complete" };

    const key = String(cond || "").trim().toLowerCase();
    const startUrl = CONFIG.START_PAGES[key];
    if (!startUrl) return { status: "idle", error: "unknown_condition" };
    const cleanPid = cleanParticipantId(pid);
    if (!cleanPid) return { status: "idle", error: "missing_pid" };

    const s = {
      status: "active",
      study: CONFIG.STUDY_NAME,
      pid: cleanPid,
      pidLooksValid: looksLikeProlificId(cleanPid),
      condition: key,
      startUrl,
      startMethod: method,
      startedAt: Date.now(),
      endedAt: null,
      endReason: null,
      exportedAt: null,
      seq: 0,
      extensionVersion: chrome.runtime.getManifest().version,
      userAgent: navigator.userAgent,
      events: []
    };
    await saveSession(s);
    await updateBadge();
    await chrome.tabs.create({ url: startUrl });
    return summarize(s);
  });
}

function finishSession() {
  return enqueue(async () => {
    const s = await getSession();
    if (!s || s.status !== "active") return summarize(s);
    const f = finishState(s);
    if (!f.canFinish) return { ...summarize(s), error: "not_enough_pages" };
    s.status = "complete";
    s.endedAt = Date.now();
    s.endReason = f.waived ? "finished_min_pages_waived" : "finished_by_participant";
    s.pagesCounted = f.pages;
    await saveSession(s);
    await updateBadge();
    await chrome.tabs.create({ url: chrome.runtime.getURL("done.html") });
    return summarize(s);
  });
}

function logEvent(evt, sender) {
  return enqueue(async () => {
    const s = await getSession();
    if (!s || s.status !== "active") return;
    const ts = typeof evt.clientTs === "number" ? evt.clientTs : Date.now();
    if (ts < s.startedAt) return;
    delete evt.clientTs;
    s.seq += 1;
    const tab = sender && sender.tab ? sender.tab : {};
    s.events.push({
      seq: s.seq,
      t_ms: ts - s.startedAt,
      ts: new Date(ts).toISOString(),
      tab_id: tab.id ?? null,
      opener_tab_id: tab.openerTabId ?? null,
      window_id: tab.windowId ?? null,
      ...evt
    });
    await saveSession(s);
  });
}

function fromStartLinkPage(sender) {
  try {
    const page = new URL(CONFIG.START_LINK_PAGE);
    const from = new URL(sender.url || (sender.tab && sender.tab.url) || "");
    return from.origin === page.origin && from.pathname === page.pathname;
  } catch (e) {
    return false;
  }
}

chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const extOrigin = chrome.runtime.getURL("");
    const fromExtension = sender.id === chrome.runtime.id && String(sender.url || "").startsWith(extOrigin);
    switch (msg && msg.type) {
      case "log":
        await logEvent(msg.event || {}, sender);
        return { ok: true };
      case "start_link":
        if (!fromStartLinkPage(sender)) return { error: "not_allowed" };
        return await startSession({ pid: msg.pid, cond: msg.cond, method: "start_link" });
      case "start":
        if (!fromExtension) return { error: "not_allowed" };
        return await startSession({ pid: msg.pid, cond: msg.cond, method: "popup" });
      case "finish":
        if (!fromExtension) return { error: "not_allowed" };
        return await finishSession();
      case "status":
        return summarize(await getSession());
      case "export": {
        if (!fromExtension) return { error: "not_allowed" };
        const s = await enqueue(async () => {
          const cur = await getSession();
          if (cur && cur.status === "complete" && !cur.exportedAt) {
            cur.exportedAt = Date.now();
            await saveSession(cur);
          }
          return cur;
        });
        return { session: s };
      }
      default:
        return { error: "unknown message" };
    }
  })().then(sendResponse, (err) => sendResponse({ error: String(err) }));
  return true;
});
