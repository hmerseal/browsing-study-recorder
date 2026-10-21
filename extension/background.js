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

function summarize(s) {
  if (!s) return { status: "idle", config: CONFIG };
  return {
    status: s.status,
    pid: s.pid,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    endReason: s.endReason,
    pageCount: s.events.filter((e) => e.type === "pageview").length,
    eventCount: s.events.length,
    exported: !!s.exportedAt,
    now: Date.now(),
    config: CONFIG
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

function startSession(pid) {
  return enqueue(async () => {
    const existing = await getSession();
    if (existing && existing.status === "active") return summarize(existing);
    const s = {
      status: "active",
      study: CONFIG.STUDY_NAME,
      pid,
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
    await chrome.tabs.create({ url: CONFIG.START_URL });
    return summarize(s);
  });
}

function finishSession() {
  return enqueue(async () => {
    const s = await getSession();
    if (!s || s.status !== "active") return summarize(s);
    s.status = "complete";
    s.endedAt = Date.now();
    s.endReason = "finished_by_participant";
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

chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case "log":
        await logEvent(msg.event || {}, sender);
        return { ok: true };
      case "start":
        return await startSession(String(msg.pid || "").trim());
      case "finish":
        return await finishSession();
      case "status":
        return summarize(await getSession());
      case "export": {
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
      case "reset":
        await enqueue(() => chrome.storage.local.remove("session"));
        await updateBadge();
        return { ok: true };
      default:
        return { error: "unknown message" };
    }
  })().then(sendResponse, (err) => sendResponse({ error: String(err) }));
  return true;
});
