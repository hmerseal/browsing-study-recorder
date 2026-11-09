const $ = (id) => document.getElementById(id);
let timer = null;
let warnedPid = null;

function show(section) {
  for (const id of ["idle", "active", "complete"]) $(id).hidden = id !== section;
}

function fmt(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

async function refresh() {
  const st = await chrome.runtime.sendMessage({ type: "status" });
  document.querySelectorAll(".min-pages").forEach((el) => (el.textContent = CONFIG.MIN_PAGES));
  if (!st || st.status === "idle") {
    show("idle");
  } else if (st.status === "active") {
    show("active");
    $("pages").textContent = st.pageCount;
    $("finish").disabled = !st.canFinish;
    $("finish-hint").hidden = st.pageCount >= CONFIG.MIN_PAGES;
    const offset = Date.now() - st.now;
    const tick = () => ($("elapsed").textContent = fmt(Date.now() - offset - st.startedAt));
    clearInterval(timer);
    tick();
    timer = setInterval(tick, 500);
  } else {
    clearInterval(timer);
    show("complete");
  }
}

$("start").addEventListener("click", async () => {
  const pid = cleanParticipantId($("pid").value);
  const code = $("code").value.trim().toLowerCase();
  const warn = $("manual-warning");
  if (!CONFIG.START_PAGES[code]) {
    warn.textContent = "That start code isn't right. Check the survey page for your code.";
    warn.hidden = false;
    return;
  }
  if (!pid) {
    warn.textContent = "Please paste your Prolific ID.";
    warn.hidden = false;
    return;
  }
  // An unusual-looking ID gets one warning, then is accepted.
  if (!looksLikeProlificId(pid) && warnedPid !== pid) {
    warnedPid = pid;
    warn.textContent = "That doesn't look like a Prolific ID, which is usually 24 letters and numbers. Check it, or click Start recording again to continue anyway.";
    warn.hidden = false;
    return;
  }
  warn.hidden = true;
  await chrome.runtime.sendMessage({ type: "start", pid, cond: code });
  await refresh();
});

$("finish").addEventListener("click", async () => {
  if (!confirm("Stop recording now? You won't be able to restart it.")) return;
  const res = await chrome.runtime.sendMessage({ type: "finish" });
  if (res && res.error === "not_enough_pages") {
    $("finish-error").textContent = `Please visit at least ${CONFIG.MIN_PAGES} different pages first.`;
    $("finish-error").hidden = false;
  }
  await refresh();
});

$("open-done").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("done.html") });
});

refresh();
setInterval(() => {
  if (!$("active").hidden) refresh();
}, 2000);
