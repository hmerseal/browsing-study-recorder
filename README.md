## Folder contents

- `extension/` is the extension itself. Zip this folder to submit it.
- `extension/config.js` holds the study settings: start page, completion message, sites never recorded (`EXCLUDED_HOSTS`), and whether to keep full URLs on ordinary sites (`KEEP_FULL_URLS`, off by default).
- `analysis/build_network.py` converts uploaded files into transition tables and per-participant GraphML networks.
- `store-assets/` has screenshots, the privacy policy draft, and the listing text for the Chrome Web Store.
- `docs/index.html` is the privacy policy as a web page, for GitHub Pages.
- `.github/workflows/release.yml` builds the zip on each GitHub release and can submit it to the store. See `GITHUB_SETUP.md`.

## 1. Try it yourself first

1. Open `chrome://extensions` in Chrome.
2. Turn on Developer mode (top right).
3. Click Load unpacked and choose the `extension` folder.
4. Pin the extension, click its icon, paste any 24-character ID (for example `5f8a2c1b9d3e4f5a6b7c8d9e`), and click Start.
5. Browse Wikipedia and other sites. Try links, new tabs, the back button, Google, and Wikipedia search.
6. Click the icon and choose Finish. The completion page opens with the download button and the remove-extension step.
7. After changing any file, click the reload icon on the extension card at `chrome://extensions`.

## 2. What the file contains

Top-level fields: `prolific_pid`, `started_at`, `ended_at`, `end_reason`, `duration_ms`, `user_agent`, `events`.

Every event has `seq`, `t_ms` (milliseconds since Start), `ts` (ISO time), `tab_id`, `opener_tab_id`, and `type`.

| type          | Key fields                                                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pageview      | `url`, `host`, `title`, `site` (wikipedia, search_engine, other), `nav_type` (navigate, back_forward, back_forward_cache, same_document, reload, excluded), `referrer`, `search_engine`, `search_query`, plus `article`, `namespace`, `redirected_from` on Wikipedia |
| link_click    | `from_url`, `to_url`, `to_article`, `link_text`, `link_kind`, `region`, `section` (Wikipedia), `search_result_rank` (search engines), `search_query`, `page_y_fraction`, `new_tab_intent`                                                                            |
| search_submit | `query`, `from_url`                                                                                                                                                                                                                                                                    |
| page_exit     | `url`, `article`, `time_on_page_ms`, `visible_ms`, `max_scroll_fraction`                                                                                                                                                                                                         |
| visibility    | `state` (visible or hidden), `url`                                                                                                                                                                                                                                                     |

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
