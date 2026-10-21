// Runs on every http(s) page. Sends events to the background worker,
// which drops them unless a study session is active.
(() => {
  if (window.top !== window) return;

  const SEARCH_ENGINES = [
    { name: "Google", host: /(^|\.)google\.[a-z.]+$/, path: /^\/search/, param: "q" },
    { name: "Bing", host: /(^|\.)bing\.com$/, path: /^\/search/, param: "q" },
    { name: "DuckDuckGo", host: /(^|\.)duckduckgo\.com$/, path: /^\/(html\/?)?$/, param: "q" },
    { name: "Yahoo", host: /(^|\.)search\.yahoo\.com$/, path: /^\/search/, param: "p" },
    { name: "Ecosia", host: /(^|\.)ecosia\.org$/, path: /^\/search/, param: "q" },
    { name: "Brave", host: /(^|\.)search\.brave\.com$/, path: /^\/search/, param: "q" }
  ];

  const isWikipedia = (host) => /(^|\.)wikipedia\.org$/.test(host);
  const isExcluded = (host) =>
    CONFIG.EXCLUDED_HOSTS.some((h) => host === h || host.endsWith("." + h));

  function engineFor(u) {
    return SEARCH_ENGINES.find((e) => e.host.test(u.hostname) && e.path.test(u.pathname)) || null;
  }

  function send(event) {
    try {
      const p = chrome.runtime.sendMessage({
        type: "log",
        event: { clientTs: Date.now(), ...event }
      });
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      // Extension was reloaded or removed. Nothing to do.
    }
  }

  // Search engines wrap result links in redirects. Recover the real destination.
  function unwrapRedirect(href) {
    try {
      const u = new URL(href, location.href);
      if (/(^|\.)google\./.test(u.hostname) && u.pathname === "/url") {
        return u.searchParams.get("q") || u.searchParams.get("url") || href;
      }
      if (/(^|\.)bing\.com$/.test(u.hostname) && u.pathname.startsWith("/ck/")) {
        const enc = u.searchParams.get("u");
        if (enc && enc.startsWith("a1")) {
          return atob(enc.slice(2).replace(/-/g, "+").replace(/_/g, "/"));
        }
      }
      if (/(^|\.)duckduckgo\.com$/.test(u.hostname) && u.pathname.startsWith("/l/")) {
        return u.searchParams.get("uddg") || href;
      }
      return u.href;
    } catch (e) {
      return href;
    }
  }

  function cleanUrl(href) {
    try {
      const u = new URL(href, location.href);
      if (isExcluded(u.hostname)) return `[excluded: ${u.hostname}]`;
      if (CONFIG.KEEP_FULL_URLS || isWikipedia(u.hostname) || engineFor(u)) return u.href;
      return u.origin + u.pathname;
    } catch (e) {
      return null;
    }
  }

  function articleFromUrl(href) {
    try {
      const u = new URL(href, location.href);
      if (!isWikipedia(u.hostname)) return null;
      if (u.pathname.startsWith("/wiki/")) {
        return decodeURIComponent(u.pathname.slice(6)).replace(/_/g, " ");
      }
      const title = u.searchParams.get("title");
      return title ? title.replace(/_/g, " ") : null;
    } catch (e) {
      return null;
    }
  }

  function pageInfo() {
    const u = new URL(location.href);
    const info = {
      url: cleanUrl(location.href),
      host: u.hostname,
      title: document.title,
      site: "other",
      search_engine: null,
      search_query: null
    };
    if (isWikipedia(u.hostname)) {
      const canonical = document.querySelector('link[rel="canonical"]');
      const nsClass = [...document.body.classList].find((c) => /^ns-(-?\d+)$/.test(c));
      const redirectedFrom = document.querySelector(".mw-redirectedfrom a");
      info.site = "wikipedia";
      info.canonical_url = canonical ? canonical.href : null;
      info.article = articleFromUrl(info.canonical_url || location.href);
      info.lang = u.hostname.split(".")[0];
      info.namespace = nsClass ? Number(nsClass.slice(3)) : null;
      info.redirected_from = redirectedFrom ? redirectedFrom.textContent.trim() : null;
      info.search_query = u.searchParams.get("search");
      if (info.search_query) info.search_engine = "Wikipedia";
    } else {
      const engine = engineFor(u);
      if (engine) {
        info.site = "search_engine";
        info.search_engine = engine.name;
        info.search_query = u.searchParams.get(engine.param);
      }
    }
    return info;
  }

  function referrerInfo() {
    const r = document.referrer;
    if (!r) return { referrer: null, referrer_article: null };
    return { referrer: cleanUrl(r), referrer_article: articleFromUrl(r) };
  }

  const host = location.hostname;
  if (isExcluded(host)) {
    // Note that the participant was on an excluded site, and nothing else.
    send({ type: "pageview", excluded: true, host, nav_type: "excluded" });
    return;
  }

  // Per-page tracking, reset on back/forward cache restores and same-page navigations.
  let pageStart, maxScroll, visibleMs, visibleSince;
  function resetPageTracking(startTs) {
    pageStart = startTs;
    maxScroll = 0;
    visibleMs = 0;
    visibleSince = document.visibilityState === "visible" ? startTs : null;
    measureScroll();
  }

  function measureScroll() {
    const doc = document.documentElement;
    if (!doc) return;
    const height = Math.max(doc.scrollHeight, 1);
    const frac = Math.min(1, (window.scrollY + window.innerHeight) / height);
    if (frac > maxScroll) maxScroll = frac;
  }

  function sendExit(url, article) {
    const now = Date.now();
    if (visibleSince !== null) visibleMs += now - visibleSince;
    visibleSince = null;
    send({
      type: "page_exit",
      url,
      article,
      time_on_page_ms: now - pageStart,
      visible_ms: visibleMs,
      max_scroll_fraction: Number(maxScroll.toFixed(3))
    });
  }

  const navEntry = performance.getEntriesByType("navigation")[0];
  const navStart = Math.round(performance.timeOrigin);
  resetPageTracking(navStart);
  let current = pageInfo();
  let lastHref = location.href;
  send({
    type: "pageview",
    clientTs: navStart,
    nav_type: navEntry ? navEntry.type : "unknown",
    ...referrerInfo(),
    ...current
  });

  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    const now = Date.now();
    resetPageTracking(now);
    current = pageInfo();
    lastHref = location.href;
    send({ type: "pageview", clientTs: now, nav_type: "back_forward_cache", ...referrerInfo(), ...current });
  });

  // Sites like Google and YouTube change pages without a full reload.
  function checkSameDocumentNav() {
    if (location.href === lastHref) return;
    const before = new URL(lastHref);
    const after = new URL(location.href);
    lastHref = location.href;
    if (before.origin + before.pathname + before.search === after.origin + after.pathname + after.search) {
      return; // only the #fragment changed
    }
    sendExit(current.url, current.article || null);
    const now = Date.now();
    const previous = current;
    resetPageTracking(now);
    current = pageInfo();
    if (current.url === previous.url && current.title === previous.title) return;
    send({
      type: "pageview",
      clientTs: now,
      nav_type: "same_document",
      referrer: previous.url,
      referrer_article: previous.article || null,
      ...current
    });
  }
  if (window.navigation && window.navigation.addEventListener) {
    window.navigation.addEventListener("navigatesuccess", () => setTimeout(checkSameDocumentNav, 300));
  }
  setInterval(checkSameDocumentNav, 1000);

  let scrollPending = false;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollPending) return;
      scrollPending = true;
      requestAnimationFrame(() => {
        measureScroll();
        scrollPending = false;
      });
    },
    { passive: true }
  );

  document.addEventListener("visibilitychange", () => {
    const now = Date.now();
    if (document.visibilityState === "visible") {
      visibleSince = now;
    } else if (visibleSince !== null) {
      visibleMs += now - visibleSince;
      visibleSince = null;
    }
    send({ type: "visibility", state: document.visibilityState, url: current.url, article: current.article || null });
  });

  window.addEventListener("pagehide", () => sendExit(current.url, current.article || null));

  const WIKI_REGIONS = [
    [".cdx-menu, .cdx-typeahead-search, #searchform, .suggestions, .vector-search-box", "search_suggestion"],
    [".infobox, .sidebar", "infobox"],
    ["#toc, .vector-toc, .toc", "table_of_contents"],
    [".hatnote, .dablink", "hatnote"],
    [".reflist, .references, .mw-references-wrap", "references"],
    [".navbox, .vertical-navbox", "navbox"],
    ["#catlinks", "categories"],
    ["#mw-content-text", "article_body"],
    ["#firstHeading, .mw-first-heading", "page_title"],
    ["header, .vector-header, #mw-head, #mw-panel, .vector-main-menu, #footer, footer", "site_navigation"]
  ];
  const SEARCH_RESULT_AREAS = "#search, #rso, #b_results, #links, [data-testid='mainline'], #web, .mainline-results";
  const GENERIC_REGIONS = [
    ["nav, [role='navigation']", "navigation"],
    ["header, [role='banner']", "header"],
    ["footer, [role='contentinfo']", "footer"],
    ["aside, [role='complementary']", "sidebar"],
    ["main, article, [role='main']", "main_content"]
  ];

  function regionFor(el) {
    if (current.site === "wikipedia") {
      for (const [selector, name] of WIKI_REGIONS) if (el.closest(selector)) return name;
      return "other";
    }
    if (current.site === "search_engine" && el.closest(SEARCH_RESULT_AREAS)) return "search_results";
    for (const [selector, name] of GENERIC_REGIONS) if (el.closest(selector)) return name;
    return "page";
  }

  function sectionFor(el) {
    const headings = document.querySelectorAll("#mw-content-text h2, #mw-content-text h3");
    let section = null;
    for (const h of headings) {
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
        section = h.textContent.replace(/\[edit\]/g, "").trim();
      } else {
        break;
      }
    }
    return section || "(lead)";
  }

  function linkKind(a, target) {
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#")) return "in_page_anchor";
    try {
      const u = new URL(target);
      if (isWikipedia(u.hostname)) {
        const title = articleFromUrl(target) || "";
        if (/^(Special|File|Help|Wikipedia|Talk|User|Category|Portal|Template):/i.test(title)) return "wiki_meta";
        if (u.pathname.startsWith("/wiki/")) return "wiki_article";
        return "wiki_other";
      }
      return u.hostname === location.hostname ? "same_site" : "other_site";
    } catch (e) {
      return "other";
    }
  }

  function handleClick(e) {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const target = unwrapRedirect(a.href);
    const rect = a.getBoundingClientRect();
    const docHeight = Math.max(document.documentElement.scrollHeight, 1);
    const region = regionFor(a);
    const wiki = current.site === "wikipedia";
    const contentLinks = wiki ? [...document.querySelectorAll("#mw-content-text a[href]")] : [];
    const idx = contentLinks.indexOf(a);
    const searchBox = wiki ? document.querySelector('input[name="search"]') : null;
    let resultRank = null;
    if (region === "search_results") {
      const results = [...document.querySelectorAll(SEARCH_RESULT_AREAS)]
        .flatMap((area) => [...area.querySelectorAll("a[href] h3, a[href] h2")])
        .map((h) => h.closest("a"));
      const r = results.indexOf(a);
      resultRank = r >= 0 ? r + 1 : null;
    }
    send({
      type: "link_click",
      from_url: current.url,
      from_article: current.article || null,
      to_url: cleanUrl(target),
      to_article: articleFromUrl(target),
      link_text: (a.textContent || "").trim().slice(0, 200),
      link_kind: linkKind(a, target),
      region,
      section: wiki && region === "article_body" ? sectionFor(a) : null,
      link_index_in_body: idx >= 0 ? idx : null,
      body_link_count: wiki ? contentLinks.length : null,
      search_result_rank: resultRank,
      search_query: current.search_query,
      page_y_fraction: Number(((rect.top + window.scrollY) / docHeight).toFixed(3)),
      button: e.button,
      new_tab_intent: e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey || a.target === "_blank",
      search_box_value: region === "search_suggestion" && searchBox ? searchBox.value : null
    });
  }

  document.addEventListener("click", handleClick, true);
  document.addEventListener("auxclick", (e) => {
    if (e.button === 1) handleClick(e);
  }, true);

  // Log only the search box of a submitted form. No other form fields are read.
  document.addEventListener(
    "submit",
    (e) => {
      const form = e.target;
      if (!form || !form.querySelector) return;
      const input = form.querySelector(
        'input[type="search"], input[name="search"], input[name="q"], input[name="query"], input[name="p"]'
      );
      if (!input || input.type === "password") return;
      send({
        type: "search_submit",
        from_url: current.url,
        from_article: current.article || null,
        query: input.value
      });
    },
    true
  );
})();
