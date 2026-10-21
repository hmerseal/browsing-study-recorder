"""Turn uploaded session files into browsing networks.

Usage:
    python build_network.py path/to/uploads_folder_or_file.json [-o output_folder]

Writes:
    transitions.csv   one row per move between pages, all participants
    nodes.csv         one row per page per participant, with visit and dwell stats
    graphs/<pid>.graphml   a directed multigraph per participant (open in Gephi, igraph, networkx)
"""
import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

import networkx as nx

START = "[session start]"


CLICK_WINDOW_MS = 10000  # a click this recent counts as the cause of the next page load


def node_name(pv):
    """Name a page.

    Wikipedia articles use their title. Search result pages become
    'Search (Engine): query'. Other pages use host + path. Excluded sites
    (survey, email) appear only as '[excluded: host]'.
    """
    if pv.get("excluded"):
        return f"[excluded: {pv.get('host')}]"
    query = (pv.get("search_query") or "").strip()
    engine = pv.get("search_engine")
    if query and engine and (engine != "Wikipedia" or pv.get("namespace") == -1):
        return f"Search ({engine}): {query}"
    if pv.get("article"):
        return pv["article"]
    url = pv.get("url") or ""
    return url.split("://", 1)[-1].rstrip("/")


def node_site(pv):
    if pv.get("excluded"):
        return "excluded"
    if pv.get("search_engine") and pv.get("search_query"):
        return "search"
    return pv.get("site") or "other"


def matches_click(click, pv, target):
    """Return how a click explains this page load: 'url', 'timing', or ''."""
    if not click:
        return ""
    names = {target, pv.get("redirected_from"), pv.get("article")}
    if (click.get("to_article") and click.get("to_article") in names) or click.get("to_url") == pv.get("url"):
        return "url"
    # Redirects and URL cleanup can hide the match. Fall back on timing.
    if pv.get("nav_type") in ("navigate", "same_document") and 0 <= pv["t_ms"] - click["t_ms"] <= CLICK_WINDOW_MS:
        if click.get("link_kind") != "in_page_anchor":
            return "timing"
    return ""


def process_session(data):
    pid = data.get("prolific_pid", "unknown")
    events = sorted(data["events"], key=lambda e: e["seq"])
    last_node = {}       # tab_id -> node currently open in that tab
    last_click = {}      # tab_id -> most recent link_click in that tab
    last_search = {}     # tab_id -> most recent search_submit
    transitions = []
    open_since = {}      # tab_id -> t_ms of the pageview not yet closed by a page_exit
    node_stats = defaultdict(lambda: {"site": "", "visits": 0, "first_t_ms": None, "visible_ms": 0,
                                      "max_scroll": 0.0, "open_at_end_ms": 0})

    for e in events:
        tab = e.get("tab_id")
        if e["type"] == "link_click":
            last_click[tab] = e
        elif e["type"] == "search_submit":
            last_search[tab] = e
        elif e["type"] == "page_exit":
            stats = node_stats[last_node.get(tab) or e.get("article") or e.get("url")]
            open_since.pop(tab, None)
            stats["visible_ms"] += e.get("visible_ms") or 0
            stats["max_scroll"] = max(stats["max_scroll"], e.get("max_scroll_fraction") or 0)
        elif e["type"] == "pageview":
            target = node_name(e)
            stats = node_stats[target]
            stats["site"] = node_site(e)
            stats["visits"] += 1
            if stats["first_t_ms"] is None:
                stats["first_t_ms"] = e["t_ms"]

            new_tab = tab not in last_node
            opener = e.get("opener_tab_id")
            source_tab = opener if new_tab and opener in last_node else tab
            source = last_node.get(source_tab, START)
            last_node[tab] = target
            open_since[tab] = e["t_ms"]

            if e.get("nav_type") == "reload" or source == target:
                continue

            click = last_click.get(source_tab)
            row = {
                "pid": pid,
                "t_ms": e["t_ms"],
                "source": source,
                "target": target,
                "type": "",
                "click_match": "",
                "opened_new_tab": new_tab and source != START,
                "region": "",
                "section": "",
                "link_text": "",
                "search_query": "",
                "search_result_rank": "",
            }
            if source == START:
                row["type"] = "session_start"
            elif e.get("nav_type", "").startswith("back_forward"):
                row["type"] = "back_forward"
            elif matches_click(click, e, target):
                row["click_match"] = matches_click(click, e, target)
                if click.get("region") == "search_suggestion":
                    row["type"] = "search_suggestion"
                elif click.get("region") == "search_results":
                    row["type"] = "search_result"
                else:
                    row["type"] = "link"
                row["region"] = click.get("region") or ""
                row["section"] = click.get("section") or ""
                row["link_text"] = click.get("link_text") or ""
                row["search_query"] = click.get("search_box_value") or click.get("search_query") or ""
                row["search_result_rank"] = click.get("search_result_rank") or ""
                last_click.pop(source_tab, None)
            elif last_search.get(source_tab):
                row["type"] = "search_submit"
                row["search_query"] = last_search.pop(source_tab).get("query", "")
            elif target.startswith("Search ("):
                row["type"] = "search_typed"
            elif e.get("excluded"):
                row["type"] = "excluded_site"
            else:
                row["type"] = "other"
            transitions.append(row)

    # Pages still open when the timer ran out never sent a page_exit.
    # Record how long they had been open so dwell time is not lost.
    if data.get("ended_at") and data.get("started_at"):
        from datetime import datetime
        end_ms = (datetime.fromisoformat(data["ended_at"].replace("Z", "+00:00"))
                  - datetime.fromisoformat(data["started_at"].replace("Z", "+00:00"))).total_seconds() * 1000
        for tab, t0 in open_since.items():
            node_stats[last_node[tab]]["open_at_end_ms"] += max(0, int(end_ms - t0))

    nodes = [{"pid": pid, "node": n, **s} for n, s in node_stats.items()]
    return pid, transitions, nodes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+", help="session .json files or folders of them")
    ap.add_argument("-o", "--out", default="network_output")
    args = ap.parse_args()

    files = []
    for p in map(Path, args.inputs):
        files.extend(sorted(p.glob("*.json")) if p.is_dir() else [p])

    out = Path(args.out)
    (out / "graphs").mkdir(parents=True, exist_ok=True)
    all_t, all_n = [], []

    for f in files:
        data = json.loads(f.read_text())
        pid, transitions, nodes = process_session(data)
        all_t.extend(transitions)
        all_n.extend(nodes)

        g = nx.MultiDiGraph(pid=pid)
        for n in nodes:
            g.add_node(n["node"], site=n["site"], visits=n["visits"], first_t_ms=n["first_t_ms"] or 0,
                       visible_ms=n["visible_ms"], max_scroll=n["max_scroll"],
                       open_at_end_ms=n["open_at_end_ms"])
        for i, t in enumerate(transitions):
            g.add_edge(t["source"], t["target"], step=i, t_ms=t["t_ms"], type=t["type"],
                       region=t["region"], section=t["section"], link_text=t["link_text"],
                       search_query=t["search_query"])
        nx.write_graphml(g, out / "graphs" / f"{pid}.graphml")
        print(f"{f.name}: {g.number_of_nodes()} pages, {len(transitions)} transitions")

    for name, rows in [("transitions.csv", all_t), ("nodes.csv", all_n)]:
        if not rows:
            continue
        with open(out / name, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
    print(f"Wrote output to {out.resolve()}")


if __name__ == "__main__":
    main()
