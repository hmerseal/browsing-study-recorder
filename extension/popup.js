const $ = (id) => document.getElementById(id);
let timer = null;

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
  if (!st || st.status === "idle") {
    show("idle");
  } else if (st.status === "active") {
    show("active");
    $("pages").textContent = st.pageCount;
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
  const pid = $("pid").value.trim();
  const valid = /^[a-f0-9]{24}$/i.test(pid);
  $("pid-warning").hidden = valid;
  if (!valid) return;
  await chrome.runtime.sendMessage({ type: "start", pid });
  await refresh();
});

$("finish").addEventListener("click", async () => {
  if (!confirm("Stop recording now? You won't be able to restart it.")) return;
  await chrome.runtime.sendMessage({ type: "finish" });
  await refresh();
});

$("open-done").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("done.html") });
});

refresh();
