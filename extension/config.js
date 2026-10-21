// Study settings. Edit these before packaging the extension.
const CONFIG = {
  STUDY_NAME: "wikipedia-browsing-study",
  // Page opened when the participant clicks Start.
  START_URL: "https://en.wikipedia.org/wiki/Main_Page",
  // Shown on the completion page so participants know where to go next.
  RETURN_INSTRUCTIONS:
    "Go back to the survey tab, upload this file, and answer the question about the scenario.",

  // Sites never recorded. A visit is logged only as "[excluded: host]" with no URL or title.
  // Each entry also covers its subdomains ("qualtrics.com" covers "upenn.qualtrics.com").
  EXCLUDED_HOSTS: [
    "prolific.com",
    "prolific.co",
    "qualtrics.com",
    "mail.google.com",
    "outlook.live.com",
    "outlook.office.com",
    "accounts.google.com"
  ],
  // false: on ordinary sites, record only the address without ?query or #fragment,
  // since those can hold personal details. Wikipedia and search engine URLs are always kept whole.
  KEEP_FULL_URLS: false
};
