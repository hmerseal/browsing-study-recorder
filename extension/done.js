const $ = (id) => document.getElementById(id);
let downloaded = false;

function buildFile(s) {
  const out = {
    study: s.study,
    prolific_pid: s.pid,
    extension_version: s.extensionVersion,
    user_agent: s.userAgent,
    started_at: new Date(s.startedAt).toISOString(),
    ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : null,
    end_reason: s.endReason,
    duration_ms: s.endedAt ? s.endedAt - s.startedAt : null,
    event_count: s.events.length,
    events: s.events
  };
  return JSON.stringify(out, null, 2);
}

async function init() {
  $("instructions").textContent = CONFIG.RETURN_INSTRUCTIONS;
  const st = await chrome.runtime.sendMessage({ type: "status" });
  if (!st || st.status === "idle") {
    $("heading").textContent = "No recording found";
    $("summary").textContent = "There is no recorded session on this computer. You can remove the extension.";
    $("download").disabled = true;
    return;
  }
  if (st.status === "active") {
    $("heading").textContent = "Still recording";
    $("summary").textContent = "Click the extension icon and choose Finish when the survey tells you to stop.";
    $("steps").hidden = true;
    return;
  }
  downloaded = st.exported;
  $("summary").textContent = `You visited ${st.pageCount} page${st.pageCount === 1 ? "" : "s"}.`;
}

$("download").addEventListener("click", async () => {
  const { session } = await chrome.runtime.sendMessage({ type: "export" });
  if (!session) return;
  const date = new Date(session.startedAt).toISOString().slice(0, 10);
  const filename = `browsing_session_${session.pid}_${date}.json`;
  const blob = new Blob([buildFile(session)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  downloaded = true;
  $("filename").textContent = filename;
  $("saved").hidden = false;
});

$("uninstall").addEventListener("click", () => {
  if (!downloaded && !confirm("You haven't downloaded your file yet. Removing the extension deletes your recording. Remove anyway?")) {
    return;
  }
  chrome.management.uninstallSelf({ showConfirmDialog: true });
});

init();
