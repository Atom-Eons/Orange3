from __future__ import annotations
import json, sqlite3, time, uuid
from pathlib import Path
from typing import Any, Iterable
from .version import SCHEMA_VERSION
from .feature_data import FEATURE_NAMES
from .utils import sha256_text, now_iso, slugify

SCHEMA = r'''
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS features(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    engine TEXT NOT NULL,
    heat_default TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS receipts(
    id TEXT PRIMARY KEY,
    feature_id TEXT,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT,
    payload_json TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources(
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL,
    text TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    raw_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks(
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    heading TEXT,
    text TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    token_estimate INTEGER NOT NULL,
    heat TEXT NOT NULL DEFAULT 'COOL'
);
CREATE TABLE IF NOT EXISTS coverage_receipts(
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    raw_stored_pct REAL,
    chunked_pct REAL,
    indexed_pct REAL,
    mapped_pct REAL,
    table_scanned INTEGER,
    equation_scanned INTEGER,
    atomized_count INTEGER,
    hot_count INTEGER,
    sleeping_recoverable INTEGER,
    payload_json TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders(
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    authority TEXT NOT NULL,
    scope TEXT NOT NULL,
    heat TEXT NOT NULL DEFAULT 'HOT_ALWAYS',
    priority REAL NOT NULL DEFAULT 1.0,
    active INTEGER NOT NULL DEFAULT 1,
    superseded_by TEXT,
    source_id TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS heat_items(
    id TEXT PRIMARY KEY,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    heat TEXT NOT NULL,
    reason TEXT NOT NULL,
    risk_if_demoted REAL DEFAULT 0.0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS atoms(
    id TEXT PRIMARY KEY,
    atom_type TEXT NOT NULL,
    content TEXT NOT NULL,
    authority TEXT NOT NULL,
    scope TEXT NOT NULL,
    source_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    future_force REAL NOT NULL,
    risk_if_lost REAL NOT NULL,
    heat TEXT NOT NULL,
    evidence_json TEXT,
    air TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS equations(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    equation_type TEXT NOT NULL,
    formula TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    residuals_json TEXT NOT NULL,
    max_error REAL NOT NULL,
    mean_error REAL NOT NULL,
    source_pointer TEXT,
    reconstruction_hash TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS caches(
    id TEXT PRIMARY KEY,
    cache_type TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    value_json TEXT NOT NULL,
    authority TEXT NOT NULL,
    heat TEXT NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    stale INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cartridges(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    atom_ids_json TEXT NOT NULL,
    air TEXT NOT NULL,
    heat TEXT NOT NULL,
    hit_rate REAL DEFAULT 0.0,
    saved_work_total REAL DEFAULT 0.0,
    staleness_score REAL DEFAULT 0.0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS routes(
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    selected_path TEXT NOT NULL,
    energy_score REAL NOT NULL,
    workset_json TEXT NOT NULL,
    warrants_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS saved_work(
    id TEXT PRIMARY KEY,
    request_hash TEXT NOT NULL,
    old_path_estimate TEXT NOT NULL,
    new_path TEXT NOT NULL,
    tokens_not_injected INTEGER NOT NULL,
    model_calls_avoided INTEGER NOT NULL,
    commitments_preserved INTEGER NOT NULL,
    payload_json TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS debt(
    id TEXT PRIMARY KEY,
    debt_type TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    severity REAL NOT NULL,
    description TEXT NOT NULL,
    resolved INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime_profiles(
    id TEXT PRIMARY KEY,
    runtime TEXT NOT NULL,
    model TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    score REAL NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_leases(
    id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    mission TEXT NOT NULL,
    token_budget INTEGER NOT NULL,
    time_budget_s INTEGER NOT NULL,
    stop_conditions_json TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(id UNINDEXED, source_id UNINDEXED, text);
'''

class Store:
    def __init__(self, path: str | Path = ':memory:'):
        self.path = str(path)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.init()

    def init(self) -> None:
        self.conn.executescript(SCHEMA)
        self.conn.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version',?)", (str(SCHEMA_VERSION),))
        self.conn.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('system_law',?)", ('Only smart work is done.',))
        self.register_features()
        self.conn.commit()

    def register_features(self) -> None:
        for i, name in enumerate(FEATURE_NAMES, start=1):
            fid = f"feat_{i:04d}_{slugify(name)[:40]}"
            category, engine, heat = classify_feature(name)
            self.conn.execute("""
            INSERT OR IGNORE INTO features(id,name,category,engine,heat_default,created_at)
            VALUES(?,?,?,?,?,?)
            """, (fid, name, category, engine, heat, now_iso()))

    def execute(self, sql: str, params: Iterable[Any] = ()):
        cur = self.conn.execute(sql, tuple(params))
        self.conn.commit()
        return cur

    def one(self, sql: str, params: Iterable[Any] = ()) -> dict | None:
        row = self.conn.execute(sql, tuple(params)).fetchone()
        return dict(row) if row else None

    def all(self, sql: str, params: Iterable[Any] = ()) -> list[dict]:
        return [dict(r) for r in self.conn.execute(sql, tuple(params)).fetchall()]

    def close(self) -> None:
        self.conn.close()

    def insert_receipt(self, action: str, status: str='ok', summary: str='', payload: Any=None, feature_id: str|None=None) -> str:
        rid = 'rcpt_' + sha256_text(f"{action}|{time.time_ns()}|{summary}|{uuid.uuid4().hex}")[:16]
        self.execute("""INSERT INTO receipts(id,feature_id,action,status,summary,payload_json,created_at)
                      VALUES(?,?,?,?,?,?,?)""", (rid, feature_id, action, status, summary, json.dumps(payload or {}, sort_keys=True), now_iso()))
        return rid


def classify_feature(name: str) -> tuple[str,str,str]:
    n = name.lower()
    if any(k in n for k in ['order','hot','heat','mission','supersession','showhot','showorders','whyhot','sleeping','lostmaingoal']):
        return 'heat_order_mission','heat','HOT_ALWAYS' if 'order' in n or 'hot_always' in n else 'WARM'
    if any(k in n for k in ['source','document','chunk','coverage','ingest','retriev','rag','citation','table','pdf','figure','upload','findability']):
        return 'source_retrieval','source','COOL'
    if any(k in n for k in ['atom','commitment','air','codec','rendering','authority','scope','claim']):
        return 'commitment_codec','codec','WARM'
    if any(k in n for k in ['equation','numeric','column','residual','linear','seasonal','data','unit','ratio','polynomial','distribution','matrix']):
        return 'equation_memory','equation','WARM'
    if any(k in n for k in ['cache','cartridge','prefix','kv','runtime','prefill','llm','vllm','sglang','llama','turboquant','tensor','lmcache']):
        return 'cache_runtime','cache','WARM'
    if any(k in n for k in ['speculat','draft','vocabulary','token']):
        return 'speculative_inference','runtime','WARM'
    if any(k in n for k in ['route','work','warrant','least','sparse','compiler','trace','friction','value','usefulbit','expansion']):
        return 'work_routing','routing','HOT_NOW'
    if any(k in n for k in ['debt','verifier','proof','probe','benchmark','recall','audit','receipt','integrity','memoryisolated']):
        return 'proof_debt_eval','proof','WARM'
    if any(k in n for k in ['agent','tool','skill','lease']):
        return 'agent_tool_governance','agent','COOL'
    if any(k in n for k in ['code','repo','symbol','aecode','patch','api','build']):
        return 'code_aecode','code','WARM'
    if any(k in n for k in ['human','attention','option','dashboard','ux','answer']):
        return 'human_attention','attention','WARM'
    if any(k in n for k in ['gaia','energy','carbon','green','telemetry','joule','metabolism','modebudget','cooling','network']):
        return 'energy_ecology','energy','WARM'
    if any(k in n for k in ['awareness','invention','evolve','thought','causal','unknown','optimizer','self']):
        return 'awareness_invention','awareness','COOL'
    if any(k in n for k in ['mode','evidencelevel','evidenceladder']):
        return 'mode_evidence','mode','WARM'
    if any(k in n for k in ['cube','memory','temporal','valid','scope','lifecycle']):
        return 'memory_lifecycle','memory','WARM'
    if any(k in n for k in ['promptinjection','secret','security','quarantine','immune','leak','trust','fence']):
        return 'security','security','WARM'
    return 'core','core','WARM'
