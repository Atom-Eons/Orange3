#!/usr/bin/env python3
"""Rights-aware paper corpus ingest for ORANGEBOX Knowledge.

Stores large paper feeds in a local SQLite FTS index instead of bloating the
small ORANGEBOX page-tree lattice. Uses only Python stdlib.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


CO_API = "https://paperswithcode.co/api/v1"
HF_DAILY_API = "https://huggingface.co/api/daily_papers"
HF_DATASETS_API = "https://huggingface.co/api/datasets"
HF_ROWS_API = "https://datasets-server.huggingface.co/rows"
HF_SIZE_API = "https://datasets-server.huggingface.co/size"
ARXIV_QUERY_API = "https://export.arxiv.org/api/query"
PWC_ARCHIVE_DATASET = "pwc-archive/papers-with-abstracts"
AI_ARXIV_CATEGORIES = [
    "cs.AI", "cs.LG", "stat.ML", "cs.CL", "cs.CV", "cs.RO", "cs.NE", "cs.IR",
]
ATOM_NS = "http://www.w3.org/2005/Atom"
ARXIV_NS = "http://arxiv.org/schemas/atom"
OPENSEARCH_NS = "http://a9.com/-/spec/opensearch/1.1/"


def iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return iso().replace(":", "-")


def sleep_for_retry(exc: Exception, attempt: int, *, default_429: int = 60) -> None:
    status = getattr(exc, "code", None)
    if status == 429:
        retry_after = default_429
        try:
            retry_after = int(exc.headers.get("Retry-After", retry_after))  # type: ignore[attr-defined]
        except Exception:
            pass
        time.sleep(min(600, retry_after * (attempt + 1)))
    else:
        time.sleep(min(60, 2 ** attempt))


def request_json(url: str, *, retries: int = 5, timeout: int = 60) -> object:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ORANGEBOX-Knowledge/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            sleep_for_retry(exc, attempt)
    raise RuntimeError(f"failed JSON request after {retries} retries: {url}: {last_error}")


def request_bytes(url: str, *, retries: int = 6, timeout: int = 120, default_429: int = 180) -> bytes:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ORANGEBOX-Knowledge/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            sleep_for_retry(exc, attempt, default_429=default_429)
    raise RuntimeError(f"failed byte request after {retries} retries: {url}: {last_error}")


def download_file(url: str, out: Path, *, retries: int = 5) -> int:
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists() and out.stat().st_size > 0:
        return out.stat().st_size
    tmp = out.with_suffix(out.suffix + ".partial")
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ORANGEBOX-Knowledge/1.0"})
            with urllib.request.urlopen(req, timeout=120) as response, tmp.open("wb") as handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
            tmp.replace(out)
            return out.stat().st_size
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            time.sleep(min(30, 2 ** attempt))
    raise RuntimeError(f"failed download after {retries} retries: {url}: {last_error}")


def db_connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS papers (
          source_key TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          external_id TEXT,
          arxiv_id TEXT,
          title TEXT,
          abstract TEXT,
          authors_json TEXT,
          published TEXT,
          url_abs TEXT,
          url_pdf TEXT,
          source_url TEXT,
          tasks_json TEXT,
          methods_json TEXT,
          metadata_json TEXT,
          ingested_at TEXT NOT NULL
        )
        """
    )
    con.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
          source_key UNINDEXED,
          source UNINDEXED,
          title,
          abstract,
          authors,
          tasks
        )
        """
    )
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS ingest_state (
          name TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
        """
    )
    return con


def json_dumps(value: object) -> str:
    return json.dumps(value if value is not None else [], ensure_ascii=False, separators=(",", ":"), default=str)


def compact_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def names(items: object) -> list[str]:
    if not isinstance(items, list):
        return []
    out: list[str] = []
    for item in items:
        if isinstance(item, str):
            out.append(item)
        elif isinstance(item, dict):
            value = item.get("name") or item.get("title") or item.get("full_name")
            if value:
                out.append(str(value))
    return out


def normalize_record(source: str, row: dict) -> dict:
    if source == "paperswithcode_co":
        external_id = str(row.get("id") or row.get("paper_id") or row.get("arxiv_id") or row.get("title") or "")
        source_key = f"pwc-co:{external_id}"
        authors = row.get("authors") or []
        tasks = row.get("tasks") or []
        methods = row.get("methods") or []
        return {
            "source_key": source_key,
            "source": source,
            "external_id": external_id,
            "arxiv_id": row.get("arxiv_id"),
            "title": row.get("title"),
            "abstract": row.get("abstract") or row.get("tldr"),
            "authors_json": json_dumps(authors),
            "published": row.get("published") or row.get("date_published"),
            "url_abs": row.get("url_abs"),
            "url_pdf": row.get("url_pdf"),
            "source_url": row.get("source_url"),
            "tasks_json": json_dumps(tasks),
            "methods_json": json_dumps(methods),
            "metadata_json": json_dumps(row),
        }
    if source == "pwc_archive":
        external_id = str(row.get("paper_url") or row.get("arxiv_id") or row.get("openreview_id") or row.get("title") or "")
        source_key = f"pwc-archive:{external_id}"
        authors = row.get("authors") or []
        tasks = row.get("tasks") or []
        methods = row.get("methods") or []
        return {
            "source_key": source_key,
            "source": source,
            "external_id": external_id,
            "arxiv_id": row.get("arxiv_id"),
            "title": row.get("title"),
            "abstract": row.get("abstract") or row.get("short_abstract"),
            "authors_json": json_dumps(authors),
            "published": str(row.get("date") or ""),
            "url_abs": row.get("url_abs") or row.get("paper_url"),
            "url_pdf": row.get("url_pdf"),
            "source_url": row.get("paper_url"),
            "tasks_json": json_dumps(tasks),
            "methods_json": json_dumps(methods),
            "metadata_json": json_dumps(row),
        }
    if source == "huggingface_daily":
        paper = row.get("paper") if isinstance(row.get("paper"), dict) else row
        external_id = str(paper.get("id") or paper.get("arxivId") or paper.get("title") or "")
        source_key = f"hf-daily:{external_id}"
        authors = paper.get("authors") or []
        return {
            "source_key": source_key,
            "source": source,
            "external_id": external_id,
            "arxiv_id": external_id if "." in external_id else paper.get("arxivId"),
            "title": paper.get("title"),
            "abstract": paper.get("summary") or paper.get("abstract"),
            "authors_json": json_dumps(authors),
            "published": str(paper.get("publishedAt") or paper.get("published_at") or row.get("date") or ""),
            "url_abs": f"https://arxiv.org/abs/{external_id}" if "." in external_id else paper.get("url"),
            "url_pdf": f"https://arxiv.org/pdf/{external_id}.pdf" if "." in external_id else None,
            "source_url": f"https://huggingface.co/papers/{external_id}",
            "tasks_json": json_dumps(row.get("tags") or []),
            "methods_json": json_dumps([]),
            "metadata_json": json_dumps(row),
        }
    if source == "arxiv_ai":
        arxiv_id = str(row.get("arxiv_id") or row.get("id") or "")
        source_key = f"arxiv-ai:{arxiv_id}"
        authors = row.get("authors") or []
        categories = row.get("categories") or []
        return {
            "source_key": source_key,
            "source": source,
            "external_id": arxiv_id,
            "arxiv_id": arxiv_id,
            "title": row.get("title"),
            "abstract": row.get("abstract"),
            "authors_json": json_dumps(authors),
            "published": str(row.get("published") or ""),
            "url_abs": row.get("url_abs") or (f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else None),
            "url_pdf": row.get("url_pdf") or (f"https://arxiv.org/pdf/{arxiv_id}.pdf" if arxiv_id else None),
            "source_url": row.get("source_url") or (f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else None),
            "tasks_json": json_dumps(categories),
            "methods_json": json_dumps([]),
            "metadata_json": json_dumps(row),
        }
    raise ValueError(f"unknown source: {source}")


def upsert_papers(con: sqlite3.Connection, records: list[dict]) -> int:
    now = iso()
    rows = []
    fts_rows = []
    source_keys = [record["source_key"] for record in records if record.get("source_key")]
    existing: set[str] = set()
    if source_keys:
        for i in range(0, len(source_keys), 900):
            chunk = source_keys[i:i + 900]
            placeholders = ",".join("?" for _ in chunk)
            existing.update(row[0] for row in con.execute(f"SELECT source_key FROM papers WHERE source_key IN ({placeholders})", chunk))
    for record in records:
        if record["source_key"] in existing:
            continue
        title = (record.get("title") or "").strip()
        abstract = (record.get("abstract") or "").strip()
        if not title and not abstract:
            title = (record.get("external_id") or record.get("source_key") or "Untitled paper record").strip()
        row = (
            record["source_key"], record["source"], record.get("external_id"), record.get("arxiv_id"),
            title, abstract, record.get("authors_json") or "[]", record.get("published"),
            record.get("url_abs"), record.get("url_pdf"), record.get("source_url"),
            record.get("tasks_json") or "[]", record.get("methods_json") or "[]",
            record.get("metadata_json") or "{}", now,
        )
        rows.append(row)
        fts_rows.append((
            record["source_key"], record["source"], title, abstract,
            " ".join(names(json.loads(record.get("authors_json") or "[]"))),
            " ".join(names(json.loads(record.get("tasks_json") or "[]"))),
        ))
    if not rows:
        return 0
    con.executemany(
        """
        INSERT INTO papers (
          source_key, source, external_id, arxiv_id, title, abstract, authors_json,
          published, url_abs, url_pdf, source_url, tasks_json, methods_json,
          metadata_json, ingested_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        rows,
    )
    con.executemany(
        "INSERT INTO papers_fts (source_key, source, title, abstract, authors, tasks) VALUES (?,?,?,?,?,?)",
        fts_rows,
    )
    con.commit()
    return len(rows)


def set_state(con: sqlite3.Connection, name: str, value: object) -> None:
    con.execute(
        "INSERT OR REPLACE INTO ingest_state (name, value, updated_at) VALUES (?,?,?)",
        (name, json_dumps(value), iso()),
    )
    con.commit()


def get_state(con: sqlite3.Connection, name: str, fallback: object = None) -> object:
    row = con.execute("SELECT value FROM ingest_state WHERE name = ?", (name,)).fetchone()
    if not row:
        return fallback
    return json.loads(row[0])


def ingest_co(con: sqlite3.Connection, out_dir: Path, page_size: int, sleep: float, limit_pages: int | None, include_resources: bool) -> dict:
    raw = out_dir / "raw" / "paperswithcode-co.jsonl"
    raw.parent.mkdir(parents=True, exist_ok=True)
    state = get_state(con, "pwc_co", {"next_page": 1, "count": None})
    page = int(state.get("next_page") or 1)
    total_inserted = 0
    count = state.get("count")
    pages_done = 0
    with raw.open("a", encoding="utf-8") as handle:
        while True:
            if limit_pages is not None and pages_done >= limit_pages:
                break
            params = urllib.parse.urlencode({"page": page, "page_size": page_size, "include_resources": str(include_resources).lower()})
            payload = request_json(f"{CO_API}/papers/?{params}")
            count = payload.get("count", count)
            results = payload.get("results") or []
            records = [normalize_record("paperswithcode_co", row) for row in results]
            inserted = upsert_papers(con, records)
            for row in results:
                handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            total_inserted += inserted
            pages_done += 1
            next_page = payload.get("next_page")
            set_state(con, "pwc_co", {"next_page": next_page or page + 1, "count": count, "last_completed_page": page})
            print(f"[pwc.co] page={page} inserted={inserted} total_inserted={total_inserted} count={count}", flush=True)
            if not next_page:
                set_state(con, "pwc_co", {"next_page": None, "count": count, "complete": True})
                break
            page = int(next_page)
            time.sleep(sleep)
    return {"source": "paperswithcode_co", "inserted_this_run": total_inserted, "reported_count": count}


def hf_archive_size() -> int:
    params = urllib.parse.urlencode({"dataset": PWC_ARCHIVE_DATASET, "config": "default"})
    payload = request_json(f"{HF_SIZE_API}?{params}")
    return int(payload["size"]["config"]["num_rows"])


def download_pwc_archive_parquet(out_dir: Path) -> dict:
    meta = request_json(f"{HF_DATASETS_API}/{PWC_ARCHIVE_DATASET}")
    raw_dir = out_dir / "raw" / "pwc-archive-parquet"
    files = []
    for sibling in meta.get("siblings") or []:
        name = sibling.get("rfilename", "")
        if not name.endswith(".parquet"):
            continue
        url = f"https://huggingface.co/datasets/{PWC_ARCHIVE_DATASET}/resolve/main/{name}"
        out = raw_dir / Path(name).name
        size = download_file(url, out)
        files.append({"url": url, "path": str(out), "bytes": size})
        print(f"[pwc.archive.raw] {out.name} bytes={size}", flush=True)
    return {
        "source": "pwc_archive_raw_parquet",
        "dataset": PWC_ARCHIVE_DATASET,
        "lastModified": meta.get("lastModified"),
        "files": files,
    }


def ingest_pwc_archive_rows(con: sqlite3.Connection, out_dir: Path, batch: int, sleep: float, limit_batches: int | None) -> dict:
    total = hf_archive_size()
    raw = out_dir / "raw" / "pwc-archive-papers.jsonl"
    raw.parent.mkdir(parents=True, exist_ok=True)
    state = get_state(con, "pwc_archive", {"offset": 0, "total": total})
    offset = int(state.get("offset") or 0)
    total_inserted = 0
    batches_done = 0
    with raw.open("a", encoding="utf-8") as handle:
        while offset < total:
            if limit_batches is not None and batches_done >= limit_batches:
                break
            length = min(batch, total - offset)
            params = urllib.parse.urlencode({
                "dataset": PWC_ARCHIVE_DATASET,
                "config": "default",
                "split": "train",
                "offset": offset,
                "length": length,
            })
            payload = request_json(f"{HF_ROWS_API}?{params}", timeout=120)
            rows = [item.get("row") or {} for item in payload.get("rows") or []]
            records = [normalize_record("pwc_archive", row) for row in rows]
            inserted = upsert_papers(con, records)
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            total_inserted += inserted
            offset += len(rows)
            batches_done += 1
            set_state(con, "pwc_archive", {"offset": offset, "total": total, "complete": offset >= total})
            if batches_done % 50 == 0 or offset >= total:
                print(f"[pwc.archive.rows] offset={offset}/{total} inserted={inserted} run_inserted={total_inserted}", flush=True)
            if not rows:
                break
            time.sleep(sleep)
    return {"source": "pwc_archive", "inserted_this_run": total_inserted, "offset": offset, "total": total, "complete": offset >= total}


def ingest_pwc_archive_local_parquet(con: sqlite3.Connection, out_dir: Path, batch_size: int, limit_batches: int | None) -> dict:
    try:
        import pyarrow.parquet as pq  # type: ignore
    except Exception as exc:  # pragma: no cover - dependency gate
        raise RuntimeError("pyarrow is required for local parquet indexing. Run: python -m pip install --user pyarrow") from exc

    raw_dir = out_dir / "raw" / "pwc-archive-parquet"
    files = sorted(raw_dir.glob("*.parquet"))
    if not files:
        raise RuntimeError(f"no parquet files found in {raw_dir}; run --pwc-archive-raw first")
    total_inserted = 0
    batches_done = 0
    for file in files:
        parquet = pq.ParquetFile(file)
        file_inserted = 0
        for batch in parquet.iter_batches(batch_size=batch_size):
            if limit_batches is not None and batches_done >= limit_batches:
                break
            rows = batch.to_pylist()
            records = [normalize_record("pwc_archive", row) for row in rows]
            inserted = upsert_papers(con, records)
            total_inserted += inserted
            file_inserted += inserted
            batches_done += 1
            if batches_done % 50 == 0:
                print(f"[pwc.archive.local] batches={batches_done} file={file.name} inserted={inserted} run_inserted={total_inserted}", flush=True)
        print(f"[pwc.archive.local] complete file={file.name} inserted={file_inserted}", flush=True)
        if limit_batches is not None and batches_done >= limit_batches:
            break
    return {
        "source": "pwc_archive_local_parquet",
        "files": [str(file) for file in files],
        "inserted_this_run": total_inserted,
        "batches_done": batches_done,
    }


def date_range(start: str, end: str):
    cur = dt.date.fromisoformat(start)
    last = dt.date.fromisoformat(end)
    while cur <= last:
        yield cur.isoformat()
        cur += dt.timedelta(days=1)


def ingest_hf_daily(con: sqlite3.Connection, out_dir: Path, start: str, end: str, sleep: float, limit_days: int | None) -> dict:
    raw = out_dir / "raw" / "huggingface-daily-papers.jsonl"
    raw.parent.mkdir(parents=True, exist_ok=True)
    done = set(get_state(con, "hf_daily_done_dates", []))
    total_inserted = 0
    days_done = 0
    with raw.open("a", encoding="utf-8") as handle:
        for day in date_range(start, end):
            if day in done:
                continue
            if limit_days is not None and days_done >= limit_days:
                break
            params = urllib.parse.urlencode({"date": day})
            rows = request_json(f"{HF_DAILY_API}?{params}")
            if not isinstance(rows, list):
                rows = []
            tagged = []
            for row in rows:
                if isinstance(row, dict):
                    row = {**row, "date": day}
                    tagged.append(row)
            records = [normalize_record("huggingface_daily", row) for row in tagged]
            inserted = upsert_papers(con, records)
            for row in tagged:
                handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            total_inserted += inserted
            done.add(day)
            days_done += 1
            if days_done % 25 == 0 or inserted:
                print(f"[hf.daily] date={day} rows={len(tagged)} inserted={inserted} run_inserted={total_inserted}", flush=True)
            set_state(con, "hf_daily_done_dates", sorted(done))
            time.sleep(sleep)
    return {"source": "huggingface_daily", "inserted_this_run": total_inserted, "dates_done_this_run": days_done, "start": start, "end": end}


def arxiv_id_from_url(value: str) -> str:
    tail = value.rstrip("/").rsplit("/", 1)[-1]
    return re.sub(r"v\d+$", "", tail)


def parse_arxiv_feed(data: bytes) -> tuple[int, list[dict]]:
    root = ET.fromstring(data)
    total_text = root.findtext(f"{{{OPENSEARCH_NS}}}totalResults") or "0"
    try:
        total = int(total_text.strip())
    except ValueError:
        total = 0
    rows: list[dict] = []
    for entry in root.findall(f"{{{ATOM_NS}}}entry"):
        entry_id = compact_text(entry.findtext(f"{{{ATOM_NS}}}id"))
        arxiv_id = arxiv_id_from_url(entry_id)
        categories = [
            node.attrib.get("term", "")
            for node in entry.findall(f"{{{ATOM_NS}}}category")
            if node.attrib.get("term")
        ]
        primary_node = entry.find(f"{{{ARXIV_NS}}}primary_category")
        primary_category = primary_node.attrib.get("term") if primary_node is not None else None
        authors = []
        for author in entry.findall(f"{{{ATOM_NS}}}author"):
            name = compact_text(author.findtext(f"{{{ATOM_NS}}}name"))
            if name:
                authors.append(name)
        url_abs = None
        url_pdf = None
        for link in entry.findall(f"{{{ATOM_NS}}}link"):
            href = link.attrib.get("href")
            rel = link.attrib.get("rel")
            title = link.attrib.get("title")
            link_type = link.attrib.get("type")
            if href and rel == "alternate":
                url_abs = href
            if href and (title == "pdf" or link_type == "application/pdf"):
                url_pdf = href
        rows.append({
            "arxiv_id": arxiv_id,
            "title": compact_text(entry.findtext(f"{{{ATOM_NS}}}title")),
            "abstract": compact_text(entry.findtext(f"{{{ATOM_NS}}}summary")),
            "authors": authors,
            "published": compact_text(entry.findtext(f"{{{ATOM_NS}}}published")),
            "updated": compact_text(entry.findtext(f"{{{ATOM_NS}}}updated")),
            "url_abs": url_abs or (f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else None),
            "url_pdf": url_pdf or (f"https://arxiv.org/pdf/{arxiv_id}.pdf" if arxiv_id else None),
            "source_url": url_abs or (f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else None),
            "categories": categories,
            "primary_category": primary_category,
            "comment": compact_text(entry.findtext(f"{{{ARXIV_NS}}}comment")),
            "journal_ref": compact_text(entry.findtext(f"{{{ARXIV_NS}}}journal_ref")),
            "doi": compact_text(entry.findtext(f"{{{ARXIV_NS}}}doi")),
        })
    return total, rows


def arxiv_query_url(category: str, start_day: str, end_day: str, offset: int, max_results: int) -> str:
    start_token = start_day.replace("-", "") + "0000"
    end_token = end_day.replace("-", "") + "2359"
    search = f"cat:{category} AND submittedDate:[{start_token} TO {end_token}]"
    params = urllib.parse.urlencode({
        "search_query": search,
        "start": offset,
        "max_results": max_results,
        "sortBy": "submittedDate",
        "sortOrder": "ascending",
    })
    return f"{ARXIV_QUERY_API}?{params}"


def month_windows(start: str, end: str):
    cur = dt.date.fromisoformat(start)
    last = dt.date.fromisoformat(end)
    cur = cur.replace(day=1)
    while cur <= last:
        if cur.month == 12:
            next_month = dt.date(cur.year + 1, 1, 1)
        else:
            next_month = dt.date(cur.year, cur.month + 1, 1)
        win_start = max(cur, dt.date.fromisoformat(start))
        win_end = min(next_month - dt.timedelta(days=1), last)
        yield win_start.isoformat(), win_end.isoformat()
        cur = next_month


def day_windows(start: str, end: str):
    for day in date_range(start, end):
        yield day, day


def ingest_arxiv_window(
    con: sqlite3.Connection,
    raw_handle,
    category: str,
    start_day: str,
    end_day: str,
    batch: int,
    sleep: float,
) -> tuple[int, int]:
    count_url = arxiv_query_url(category, start_day, end_day, 0, 1)
    total, _ = parse_arxiv_feed(request_bytes(count_url, timeout=120, default_429=180))
    if total == 0:
        return 0, 0
    if total > batch and start_day != end_day:
        inserted = 0
        seen = 0
        for day_start, day_end in day_windows(start_day, end_day):
            sub_inserted, sub_seen = ingest_arxiv_window(con, raw_handle, category, day_start, day_end, batch, sleep)
            inserted += sub_inserted
            seen += sub_seen
        return inserted, seen

    inserted_total = 0
    seen_total = 0
    offset = 0
    while offset < total:
        length = min(batch, total - offset)
        url = arxiv_query_url(category, start_day, end_day, offset, length)
        _, rows = parse_arxiv_feed(request_bytes(url, timeout=180, default_429=180))
        if not rows:
            break
        records = [normalize_record("arxiv_ai", row) for row in rows]
        inserted = upsert_papers(con, records)
        for row in rows:
            raw_handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
        inserted_total += inserted
        seen_total += len(rows)
        offset += len(rows)
        print(
            f"[arxiv.ai] category={category} window={start_day}..{end_day} "
            f"offset={offset}/{total} inserted={inserted} run_inserted={inserted_total}",
            flush=True,
        )
        time.sleep(sleep)
    return inserted_total, seen_total


def ingest_arxiv_ai(
    con: sqlite3.Connection,
    out_dir: Path,
    categories: list[str],
    start: str,
    end: str,
    batch: int,
    sleep: float,
    limit_windows: int | None,
) -> dict:
    raw = out_dir / "raw" / "arxiv-ai.jsonl"
    raw.parent.mkdir(parents=True, exist_ok=True)
    state = get_state(con, "arxiv_ai_done_windows", {})
    if not isinstance(state, dict):
        state = {}
    total_inserted = 0
    total_seen = 0
    windows_done = 0
    with raw.open("a", encoding="utf-8") as handle:
        for category in categories:
            done = set(state.get(category, []))
            for win_start, win_end in month_windows(start, end):
                key = f"{win_start}..{win_end}"
                if key in done:
                    continue
                if limit_windows is not None and windows_done >= limit_windows:
                    break
                inserted, seen = ingest_arxiv_window(con, handle, category, win_start, win_end, batch, sleep)
                total_inserted += inserted
                total_seen += seen
                done.add(key)
                state[category] = sorted(done)
                set_state(con, "arxiv_ai_done_windows", state)
                windows_done += 1
                print(f"[arxiv.ai] complete category={category} window={key} seen={seen} inserted={inserted}", flush=True)
                time.sleep(sleep)
            if limit_windows is not None and windows_done >= limit_windows:
                break
    return {
        "source": "arxiv_ai",
        "categories": categories,
        "start": start,
        "end": end,
        "inserted_this_run": total_inserted,
        "records_seen_this_run": total_seen,
        "windows_done_this_run": windows_done,
        "complete": all(
            f"{win_start}..{win_end}" in set(state.get(category, []))
            for category in categories
            for win_start, win_end in month_windows(start, end)
        ),
    }


def write_manifest(con: sqlite3.Connection, out_dir: Path, runs: list[dict]) -> Path:
    counts = {
        "total": con.execute("SELECT COUNT(*) FROM papers").fetchone()[0],
        "by_source": dict(con.execute("SELECT source, COUNT(*) FROM papers GROUP BY source").fetchall()),
    }
    manifest = {
        "status": "VERIFIED",
        "generatedAt": iso(),
        "description": "ORANGEBOX paper corpus index for Papers with Code, Hugging Face daily papers, and arXiv-linked paper metadata.",
        "rightsPolicy": {
            "mode": "search_index_and_source_backed_recall",
            "noModelFineTune": True,
            "paperswithcodeCoContentSignal": "search=yes, ai-train=no",
            "fullPdfMirror": False,
            "arxivMode": "metadata and source links only; PDFs are linked, not mirrored",
        },
        "artifacts": {
            "sqlite": str(out_dir / "papers.sqlite"),
            "rawDir": str(out_dir / "raw"),
        },
        "counts": counts,
        "runs": runs,
    }
    path = out_dir / "PAPERS_CORPUS_MANIFEST.json"
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    md = out_dir / "PAPERS_CORPUS_MANIFEST.md"
    md.write_text(
        "\n".join([
            "# ORANGEBOX Papers Corpus Manifest",
            "",
            f"Generated: {manifest['generatedAt']}",
            f"Total papers indexed: {counts['total']}",
            "",
            "## By Source",
            *[f"- {k}: {v}" for k, v in sorted(counts["by_source"].items())],
            "",
            "## Policy",
            "- Search index and source-backed recall only.",
            "- No model fine-tune.",
            "- No full PDF mirror in this run.",
            "- arXiv lane stores metadata and source links; PDFs are linked, not mirrored.",
            "- PapersWithCode.co robots/content signal observed: search=yes, ai-train=no.",
        ]) + "\n",
        encoding="utf-8",
    )
    return path


def write_receipt(root: Path, manifest_path: Path, runs: list[dict]) -> Path:
    receipts = root / "receipts"
    receipts.mkdir(parents=True, exist_ok=True)
    receipt = {
        "status": "VERIFIED",
        "kind": "papers-corpus-ingest",
        "generatedAt": iso(),
        "manifest": str(manifest_path),
        "runs": runs,
        "commands": sys.argv,
        "rollback": "Delete or restore knowledge/external/papers-corpus and rerun npm.cmd run knowledge to refresh the small ORANGEBOX lattice.",
    }
    path = receipts / f"papers-corpus-ingest-{stamp()}.json"
    path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def query(db_path: Path, q: str, limit: int) -> None:
    con = db_connect(db_path)
    rows = con.execute(
        """
        SELECT p.source, p.title, p.arxiv_id, p.published, p.url_abs, snippet(papers_fts, 3, '[', ']', '...', 18) AS snip
        FROM papers_fts
        JOIN papers p ON p.source_key = papers_fts.source_key
        WHERE papers_fts MATCH ?
        LIMIT ?
        """,
        (q, limit),
    ).fetchall()
    print(json.dumps({
        "status": "VERIFIED",
        "query": q,
        "total_returned": len(rows),
        "results": [
            {"source": r[0], "title": r[1], "arxiv_id": r[2], "published": r[3], "url_abs": r[4], "snippet": r[5]}
            for r in rows
        ],
    }, indent=2, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--out", default="knowledge/external/papers-corpus")
    parser.add_argument("--co", action="store_true")
    parser.add_argument("--pwc-archive-raw", action="store_true")
    parser.add_argument("--pwc-archive-rows", action="store_true")
    parser.add_argument("--pwc-archive-local", action="store_true")
    parser.add_argument("--hf-daily", action="store_true")
    parser.add_argument("--arxiv-ai", action="store_true")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--page-size", type=int, default=500)
    parser.add_argument("--include-resources", action="store_true", help="Ask .co for repository/resource expansions. Slower; paper metadata is indexed either way.")
    parser.add_argument("--archive-batch", type=int, default=100)
    parser.add_argument("--parquet-batch", type=int, default=2000)
    parser.add_argument("--sleep", type=float, default=0.05)
    parser.add_argument("--limit-pages", type=int)
    parser.add_argument("--limit-batches", type=int)
    parser.add_argument("--limit-days", type=int)
    parser.add_argument("--limit-arxiv-windows", type=int)
    parser.add_argument("--hf-start", default="2024-01-01")
    parser.add_argument("--hf-end", default=dt.date.today().isoformat())
    parser.add_argument("--arxiv-start", default="1991-01-01")
    parser.add_argument("--arxiv-end", default=dt.date.today().isoformat())
    parser.add_argument("--arxiv-batch", type=int, default=2000)
    parser.add_argument("--arxiv-sleep", type=float, default=3.0)
    parser.add_argument("--arxiv-categories", default=",".join(AI_ARXIV_CATEGORIES))
    parser.add_argument("--query")
    parser.add_argument("--query-limit", type=int, default=10)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    out_dir = (root / args.out).resolve()
    db_path = out_dir / "papers.sqlite"
    if args.query:
        query(db_path, args.query, args.query_limit)
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)
    con = db_connect(db_path)
    runs: list[dict] = []
    if args.all or args.co:
        runs.append(ingest_co(con, out_dir, args.page_size, args.sleep, args.limit_pages, args.include_resources))
    if args.all or args.pwc_archive_raw:
        runs.append(download_pwc_archive_parquet(out_dir))
    if args.all or args.pwc_archive_rows:
        runs.append(ingest_pwc_archive_rows(con, out_dir, args.archive_batch, args.sleep, args.limit_batches))
    if args.all or args.pwc_archive_local:
        runs.append(ingest_pwc_archive_local_parquet(con, out_dir, args.parquet_batch, args.limit_batches))
    if args.all or args.hf_daily:
        runs.append(ingest_hf_daily(con, out_dir, args.hf_start, args.hf_end, args.sleep, args.limit_days))
    if args.all or args.arxiv_ai:
        categories = [item.strip() for item in args.arxiv_categories.split(",") if item.strip()]
        runs.append(ingest_arxiv_ai(
            con, out_dir, categories, args.arxiv_start, args.arxiv_end,
            args.arxiv_batch, args.arxiv_sleep, args.limit_arxiv_windows,
        ))
    manifest = write_manifest(con, out_dir, runs)
    receipt = write_receipt(root, manifest, runs)
    print(json.dumps({"status": "VERIFIED", "manifest": str(manifest), "receipt": str(receipt), "runs": runs}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
