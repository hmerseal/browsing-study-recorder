# Browsing Study Recorder

A Chrome extension that records a participant's web browsing from Start until they click Finish, and exports it as a JSON file they upload to your survey. Plus a script that turns those files into networks.

## Folder contents

- `extension/` is the extension itself. Zip this folder to submit it.
- `extension/config.js` holds the study settings: starting page for each condition (`START_PAGES`), the start link page, the page minimum (`MIN_PAGES`) and when it is waived, completion message, sites never recorded (`EXCLUDED_HOSTS`), and whether to keep full URLs on ordinary sites (`KEEP_FULL_URLS`, off by default).
- `analysis/build_network.py` converts uploaded files into transition tables and per-participant GraphML networks.
- `store-assets/` has screenshots, the privacy policy draft, and the listing text for the Chrome Web Store.
- `docs/index.html` is the privacy policy as a web page, for GitHub Pages.
- `docs/start.html` is the start page your survey links to. It starts the recording with the participant's ID and condition.
- `.github/workflows/release.yml` builds the zip on each GitHub release and can submit it to the store. See `GITHUB_SETUP.md`.

## 1. Try it yourself first

1. Open `chrome://extensions` in Chrome.
2. Turn on Developer mode (top right).
3. Click Load unpacked and choose the `extension` folder.
4. Pin the extension. Open `https://hmerseal.github.io/browsing-study-recorder/start.html?pid=5f8a2c1b9d3e4f5a6b7c8d9e&cond=hepa` and click Start recording. Use `cond=mening` for the other condition.
   - Fallback: click the icon, open "The start link didn't work", paste an ID, and type `hepa` or `mening` as the start code.
5. Browse Wikipedia and other sites. Try links, new tabs, the back button, Google, and Wikipedia search.
6. Visit at least 5 pages, then click the icon and choose Finish. The completion page opens with the download button and the remove-extension step.
7. After changing any file, click the reload icon on the extension card at `chrome://extensions`.

## 2. What the file contains

Top-level fields: `prolific_pid`, `started_at`, `ended_at`, `end_reason`, `duration_ms`, `user_agent`, `events`.

Every event has `seq`, `t_ms` (milliseconds since Start), `ts` (ISO time), `tab_id`, `opener_tab_id`, and `type`.

| type | Key fields |
|---|---|
| pageview | `url`, `host`, `title`, `site` (wikipedia, search_engine, other), `nav_type` (navigate, back_forward, back_forward_cache, same_document, reload, excluded), `referrer`, `search_engine`, `search_query`, plus `article`, `namespace`, `redirected_from` on Wikipedia |
| link_click | `from_url`, `to_url`, `to_article`, `link_text`, `link_kind`, `region`, `section` (Wikipedia), `search_result_rank` (search engines), `search_query`, `page_y_fraction`, `new_tab_intent` |
| search_submit | `query`, `from_url` |
| page_exit | `url`, `article`, `time_on_page_ms`, `visible_ms`, `max_scroll_fraction` |
| visibility | `state` (visible or hidden), `url` |

Notes:

- `opener_tab_id` links a page opened in a new tab to the tab it came from.
- Search pages (Google, Bing, DuckDuckGo, Yahoo, Ecosia, Brave, and Wikipedia search) carry `search_engine` and `search_query`.
- Search engine result links are unwrapped, so `to_url` is the real destination rather than a Google redirect.
- On ordinary sites the URL is stored without its query string or fragment unless `KEEP_FULL_URLS` is true.
- Excluded sites appear only as a pageview with `excluded: true` and the host name.
- `same_document` pageviews come from sites that change pages without reloading, such as YouTube.
- `region` on Wikipedia is article_body, infobox, hatnote, references, navbox, table_of_contents, search_suggestion, and so on. On search engines it is search_results. Elsewhere it is navigation, header, footer, sidebar, main_content, or page.
- Pages still open when the participant clicks Finish do not get a `page_exit`. The network script estimates their open time.
- Tabs that were already open before Start still log clicks, but not their initial pageview. Tell participants to start from the tab the extension opens.

## 3. Build networks

```
pip install networkx
python analysis/build_network.py path/to/uploaded_files/ -o network_output
```

Outputs:

- `transitions.csv`: one row per move (source, target, time, type, link region, section, link text, search query)
- `nodes.csv`: one row per page per participant (visits, first visit time, visible time, max scroll)
- `graphs/<pid>.graphml`: a directed multigraph per participant

Nodes are Wikipedia article titles, `Search (Engine): query` for search pages, `host/path` for other pages, and `[excluded: host]` for excluded sites. Each node has a `site` attribute (wikipedia, search, other, excluded).

Transition types are `session_start`, `link`, `search_result`, `search_submit`, `search_typed` (a search run from the address bar), `search_suggestion`, `back_forward`, `excluded_site`, and `other`. `click_match` says whether a link click was matched to the next page by URL or, when redirects hide the URL, by timing (within 10 seconds).

## 4. Publish to the Chrome Web Store

To do this through GitHub instead, follow `GITHUB_SETUP.md`. The manual route is below.


1. Fill in the bracketed parts of `store-assets/privacy_policy.md` and host it at a public URL. A page on your portfolio site, a GitHub Pages page, or a public Google Doc all work.
2. Edit `config.js` if needed. Bump `version` in `manifest.json` for every resubmission.
3. Zip the contents of `extension/` so `manifest.json` sits at the top of the zip.
4. Go to the Chrome Web Store Developer Dashboard, sign in with a Google account, agree to the terms, and pay the one-time registration fee.
5. Click Add new item and upload the zip.
6. Fill in the Store listing, Privacy, and Distribution tabs using `store-assets/store_listing.md`. Upload the three screenshots.
7. Set Visibility to Unlisted.
8. Submit for review. You get an email when it is approved. Then copy the extension's store URL into your survey.

To update later, bump the version, rezip, upload on the item's Package tab, and resubmit.

## 5. Survey flow (Qualtrics or similar)

1. Consent, including that an extension will record their browsing until they click Finish, what is and isn't recorded, and that they can inspect the file before uploading.
2. A check that they are on desktop Chrome, Edge, or Brave.
3. Install instructions with the store link. Ask them to pin the extension.
4. Pass the Prolific ID into the survey with `?PROLIFIC_PID={{%PROLIFIC_PID%}}`, and store the condition as embedded data `condition` with value `hepa` or `mening`.
5. The scenario and question. Then show the start link, built from those two fields:
   `https://hmerseal.github.io/browsing-study-recorder/start.html?pid=${e://Field/PROLIFIC_PID}&cond=${e://Field/condition}`
   Also show the start code (`${e://Field/condition}`) for the popup fallback.
6. A timing page that holds them for 10 minutes, then tells them to click the extension icon and choose Finish. The completion page that opens has the download button.
7. File upload question. Check that it accepts .json files. If it doesn't, change the download name in `done.js` to end in `.txt`.
8. The answer question.
9. Uninstall instructions, repeated from the completion page: click Remove extension now on that page, or use the puzzle piece icon, the three dots next to Browsing Study Recorder, and Remove from Chrome. Then the completion code.

Because recording runs until Finish, a participant who skips that step keeps recording locally until they remove the extension. Nothing is sent anywhere, and removing the extension deletes it, so the uninstall step matters. You could add a yes/no item asking whether they removed it.
