#!/usr/bin/env python3
"""kobo_chat: turn a Claude Code session transcript into an EPUB for a Kobo eReader.

No third-party dependencies. Usage:

    python3 kobo_chat/kobo_chat.py export                 # newest session for this folder
    python3 kobo_chat/kobo_chat.py export --since "kobo mode on" --title "My notes"
    python3 kobo_chat/kobo_chat.py export --transcript path/to/session.jsonl --out ./books

The command prints a JSON line with the EPUB path, size and sha256 so an agent
can upload it (for example to the "Rakuten Kobo" folder in Google Drive).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import os
import re
import sys
import uuid
import zipfile
from pathlib import Path

END_WORD = "update"
ANY_TAG_BLOCK = re.compile(r"<(system-reminder|command-name|command-message|command-args|local-command-stdout)\b[^>]*>.*?</\1>", re.S)


# ---------------------------------------------------------------- transcript

def default_transcript() -> Path:
    root = Path.home() / ".claude" / "projects"
    slug = re.sub(r"[^A-Za-z0-9]", "-", os.getcwd())
    candidates = sorted((root / slug).glob("*.jsonl"), key=lambda p: p.stat().st_mtime)
    if not candidates:
        candidates = sorted(root.glob("*/*.jsonl"), key=lambda p: p.stat().st_mtime)
    if not candidates:
        sys.exit("No Claude Code transcript found under ~/.claude/projects")
    return candidates[-1]


def clean_user_text(text: str) -> str:
    text = ANY_TAG_BLOCK.sub("", text)
    return text.strip()


def read_turns(path: Path) -> tuple[list[tuple[str, str]], str | None]:
    """Return [(role, text), ...] with consecutive same-role text merged, and the AI title."""
    turns: list[tuple[str, str]] = []
    title = None
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            if d.get("type") == "ai-title":
                title = d.get("aiTitle") or title
                continue
            if d.get("isSidechain") or d.get("isMeta"):
                continue
            kind = d.get("type")
            if kind not in ("user", "assistant"):
                continue
            content = (d.get("message") or {}).get("content")
            if kind == "user":
                if not isinstance(content, str):
                    continue  # tool results
                text = clean_user_text(content)
            else:
                if not isinstance(content, list):
                    continue
                text = "\n\n".join(b.get("text", "") for b in content if b.get("type") == "text").strip()
            if not text:
                continue
            if turns and turns[-1][0] == kind:
                turns[-1] = (kind, turns[-1][1] + "\n\n" + text)
            else:
                turns.append((kind, text))
    return turns, title


def trim(turns, since: str | None):
    if since:
        key = since.lower()
        starts = [i for i, (r, t) in enumerate(turns) if r == "user" and key in t.lower()]
        if starts:
            turns = turns[starts[-1] + 1:]
    ends = [i for i, (r, t) in enumerate(turns) if r == "user" and t.strip().lower().strip(".!") == END_WORD]
    if ends:
        turns = turns[: ends[-1]]
    return turns


# ---------------------------------------------------------------- markdown

def inline(s: str) -> str:
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', s)
    return s


def md_to_xhtml(md: str) -> str:
    out: list[str] = []
    para: list[str] = []
    list_kind = None
    in_code = False
    code: list[str] = []

    def flush_para():
        if para:
            out.append("<p>" + "<br/>".join(inline(x) for x in para) + "</p>")
            para.clear()

    def close_list():
        nonlocal list_kind
        if list_kind:
            out.append(f"</{list_kind}>")
            list_kind = None

    for raw in md.splitlines():
        line = raw.rstrip()
        if line.strip().startswith("```"):
            if in_code:
                out.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
                code.clear()
                in_code = False
            else:
                flush_para(); close_list(); in_code = True
            continue
        if in_code:
            code.append(raw)
            continue
        if not line.strip():
            flush_para(); close_list(); continue
        m = re.match(r"^(#{1,6})\s+(.*)", line)
        if m:
            flush_para(); close_list()
            lvl = min(len(m.group(1)) + 2, 6)
            out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>")
            continue
        if re.fullmatch(r"\s*\*\*[^*]+\*\*\s*", line):  # bold-only line acts as heading
            flush_para(); close_list()
            out.append(f"<h4>{inline(line.strip()[2:-2])}</h4>")
            continue
        if re.fullmatch(r"\s*(-{3,}|\*{3,})\s*", line):
            flush_para(); close_list(); out.append("<hr/>"); continue
        m = re.match(r"^\s*([-*+]|\d+[.)])\s+(.*)", line)
        if m:
            flush_para()
            kind = "ol" if m.group(1)[0].isdigit() else "ul"
            if list_kind != kind:
                close_list(); out.append(f"<{kind}>"); list_kind = kind
            out.append(f"<li>{inline(m.group(2))}</li>")
            continue
        if line.startswith(">"):
            flush_para(); close_list()
            out.append(f"<blockquote><p>{inline(line.lstrip('> '))}</p></blockquote>")
            continue
        close_list()
        para.append(line.strip())
    if in_code:
        out.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
    flush_para(); close_list()
    return "\n".join(out)


# ---------------------------------------------------------------- epub

CSS = """body{font-family:serif;line-height:1.5;margin:0 .4em}
h1{font-size:1.5em;margin:.2em 0}h2{font-size:1.2em;margin:1.2em 0 .4em}
h3,h4,h5,h6{font-size:1em;margin:1em 0 .3em}
.who{font-family:sans-serif;font-size:.8em;letter-spacing:.05em;text-transform:uppercase;margin:1.2em 0 .2em}
.user{border-left:3px solid #888;padding-left:.6em;font-style:italic}
pre{white-space:pre-wrap;font-size:.85em}code{font-family:monospace}
.meta{font-size:.85em}"""


def page(title: str, body: str) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">'
        f"<head><meta charset=\"utf-8\"/><title>{html.escape(title)}</title>"
        '<link rel="stylesheet" type="text/css" href="style.css"/></head>'
        f"<body>{body}</body></html>"
    )


def build_epub(turns, title: str, out_dir: Path, author: str = "Claude chat") -> Path:
    now = dt.datetime.now()
    book_id = f"urn:uuid:{uuid.uuid4()}"
    safe = re.sub(r"[^\w\- ]+", "", title).strip()[:60] or "Chat"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"Claude Chat {now:%Y-%m-%d %H%M} - {safe}.epub"

    # chapters: one per user question (with the answer that follows)
    chapters: list[tuple[str, str]] = []
    cur_title, cur_body = None, []
    for role, text in turns:
        if role == "user":
            if cur_body:
                chapters.append((cur_title or "Start", "".join(cur_body)))
            first = re.sub(r"\s+", " ", text).strip()
            cur_title = (first[:60] + "…") if len(first) > 60 else first
            cur_body = [f'<h2>{html.escape(cur_title)}</h2><p class="who">Aap</p>'
                        f'<div class="user">{md_to_xhtml(text)}</div>']
        else:
            cur_body.append(f'<p class="who">Claude</p>{md_to_xhtml(text)}')
    if cur_body:
        chapters.append((cur_title or "Start", "".join(cur_body)))
    if not chapters:
        sys.exit("Nothing to export: no chat messages found in range")

    cover = (f"<h1>{html.escape(title)}</h1>"
             f'<p class="meta">{now:%d %B %Y, %H:%M}</p>'
             f'<p class="meta">{sum(1 for r, _ in turns if r == "user")} sawal, Claude ke saath chat</p>')

    files = {"title.xhtml": page(title, cover)}
    for i, (ct, body) in enumerate(chapters, 1):
        files[f"c{i:03}.xhtml"] = page(ct, body)

    nav_items = "".join(f'<li><a href="c{i:03}.xhtml">{html.escape(ct)}</a></li>'
                        for i, (ct, _) in enumerate(chapters, 1))
    files["nav.xhtml"] = page("Contents", f'<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>{nav_items}</ol></nav>')

    ncx_points = "".join(
        f'<navPoint id="n{i}" playOrder="{i}"><navLabel><text>{html.escape(ct)}</text></navLabel>'
        f'<content src="c{i:03}.xhtml"/></navPoint>' for i, (ct, _) in enumerate(chapters, 1))
    ncx = ('<?xml version="1.0" encoding="utf-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">'
           f'<head><meta name="dtb:uid" content="{book_id}"/></head><docTitle><text>{html.escape(title)}</text></docTitle>'
           f"<navMap>{ncx_points}</navMap></ncx>")

    spine_ids = ["title"] + [f"c{i:03}" for i in range(1, len(chapters) + 1)]
    manifest = "".join(f'<item id="{s}" href="{s}.xhtml" media-type="application/xhtml+xml"/>' for s in spine_ids)
    opf = ('<?xml version="1.0" encoding="utf-8"?>'
           '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">'
           '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
           f'<dc:identifier id="bookid">{book_id}</dc:identifier><dc:title>{html.escape(title)}</dc:title>'
           f'<dc:creator>{html.escape(author)}</dc:creator><dc:language>en</dc:language>'
           f'<meta property="dcterms:modified">{dt.datetime.now(dt.timezone.utc):%Y-%m-%dT%H:%M:%SZ}</meta>'
           '</metadata><manifest>'
           '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
           '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
           '<item id="css" href="style.css" media-type="text/css"/>'
           f"{manifest}</manifest>"
           '<spine toc="ncx">' + "".join(f'<itemref idref="{s}"/>' for s in spine_ids) + "</spine></package>")

    with zipfile.ZipFile(path, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml",
                   '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                   '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
                   "</rootfiles></container>", compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/toc.ncx", ncx, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/style.css", CSS, compress_type=zipfile.ZIP_DEFLATED)
        for name, data in files.items():
            z.writestr(f"OEBPS/{name}", data, compress_type=zipfile.ZIP_DEFLATED)
    return path


# ---------------------------------------------------------------- cli

def main(argv=None):
    ap = argparse.ArgumentParser(prog="kobo_chat", description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    ex = sub.add_parser("export", help="build an EPUB from a session transcript")
    ex.add_argument("--transcript", type=Path, help="session .jsonl (default: newest for this folder)")
    ex.add_argument("--title", help="book title (default: the session's AI title)")
    ex.add_argument("--since", help="start after the last user message containing this text, e.g. 'kobo mode on'")
    ex.add_argument("--out", type=Path, default=Path.cwd() / "kobo_out", help="output folder")
    a = ap.parse_args(argv)

    src = a.transcript or default_transcript()
    turns, ai_title = read_turns(src)
    turns = trim(turns, a.since)
    title = a.title or ai_title or "Claude chat"
    path = build_epub(turns, title, a.out).resolve()
    data = path.read_bytes()
    print(json.dumps({"epub": str(path), "title": title, "bytes": len(data),
                      "sha256": hashlib.sha256(data).hexdigest(), "turns": len(turns),
                      "transcript": str(src)}))


if __name__ == "__main__":
    main()
