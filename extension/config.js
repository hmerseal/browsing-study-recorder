// Study settings. Edit these before packaging the extension.
const CONFIG = {
  STUDY_NAME: "vaccine-information-seeking",

  // Starting page for each condition. The survey's start link passes one of these keys
  // as ?cond=..., and participants starting from the popup type the key as a start code.
  START_PAGES: {
    hepa: "https://en.wikipedia.org/wiki/Hepatitis_A",
    mening: "https://en.wikipedia.org/wiki/Meningococcal_disease"
  },

  // The start page hosted on GitHub Pages. Only this page can start a recording.
  START_LINK_PAGE: "https://hmerseal.github.io/browsing-study-recorder/start.html",

  // Distinct pages a participant must visit before Finish unlocks.
  // Search result pages and excluded sites don't count. The starting page does.
  MIN_PAGES: 5,
  // After this many minutes, Finish unlocks even with fewer pages, so nobody gets stuck.
  // The file records the page count, so you can exclude these people later. Set to null to never waive.
  MIN_PAGES_WAIVED_AFTER_MINUTES: 15,

  // Shown on the completion page so participants know where to go next.
  RETURN_INSTRUCTIONS:
    "Go back to the survey tab and upload this file.",

  // Sites never recorded. A visit is logged only as "[excluded: host]" with no URL or title.
  // Each entry also covers its subdomains ("qualtrics.com" covers "upenn.qualtrics.com").
  EXCLUDED_HOSTS: [
    "prolific.com",
    "prolific.co",
    "qualtrics.com",
    "mail.google.com",
    "outlook.live.com",
    "outlook.office.com",
    "accounts.google.com",
    "hmerseal.github.io"
  ],
  // false: on ordinary sites, record only the address without ?query or #fragment,
  // since those can hold personal details. Wikipedia and search engine URLs are always kept whole.
  KEEP_FULL_URLS: false
};

// Shared by the popup, the start link, and the background worker.
function cleanParticipantId(raw) {
  return String(raw || "")
    .replace(/[​-‍⁠﻿ ]/g, "")
    .replace(/["'`‘’“”<>]/g, "")
    .trim();
}

function looksLikeProlificId(pid) {
  return /^[a-z0-9]{24}$/i.test(pid);
}
