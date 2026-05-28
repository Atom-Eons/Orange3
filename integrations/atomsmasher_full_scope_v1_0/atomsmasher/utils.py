from __future__ import annotations
import hashlib, json, re, datetime, math
from typing import Iterable

def now_iso() -> str:
    return datetime.datetime.now(datetime.UTC).replace(microsecond=0).isoformat().replace('+00:00','Z')

def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8', errors='replace')).hexdigest()

def slugify(text: str) -> str:
    s = re.sub(r'[^a-zA-Z0-9]+','_', text.strip().lower()).strip('_')
    return s or 'item'

def token_estimate(text: str) -> int:
    return max(1, math.ceil(len(text) / 4))

def normalize(text: str) -> str:
    return re.sub(r'\s+',' ', text.strip().lower())

def jdump(obj) -> str:
    return json.dumps(obj, sort_keys=True, indent=2)

def split_chunks(text: str, max_chars: int = 1200) -> list[tuple[str,str]]:
    # Heading-aware, then paragraph-aware, then hard split.
    lines = text.replace('\r\n','\n').replace('\r','\n').split('\n')
    chunks: list[tuple[str,str]] = []
    heading = 'root'
    buf = []
    def flush():
        nonlocal buf
        if not buf: return
        block = '\n'.join(buf).strip()
        if not block: 
            buf=[]; return
        while len(block) > max_chars:
            cut = block.rfind(' ', 0, max_chars)
            if cut < max_chars//2: cut = max_chars
            chunks.append((heading, block[:cut].strip()))
            block = block[cut:].strip()
        if block:
            chunks.append((heading, block))
        buf=[]
    for line in lines:
        stripped = line.strip()
        if re.match(r'^(#{1,6}\s+|[A-Z0-9][A-Z0-9 /:_-]{4,80}$)', stripped):
            flush(); heading = stripped.lstrip('#').strip() or heading
        elif stripped == '':
            if sum(len(x) for x in buf) > max_chars//2: flush()
            else: buf.append(line)
        else:
            buf.append(line)
            if sum(len(x) for x in buf) > max_chars: flush()
    flush()
    return chunks or [('root', text[:max_chars])]

def cosine_like(a: set[str], b: set[str]) -> float:
    if not a or not b: return 0.0
    return len(a & b) / (len(a) * len(b)) ** 0.5

def keywords(text: str) -> set[str]:
    stop = {'the','and','for','with','that','this','from','have','what','when','where','into','your','you','are','but','not','all','can','will','must','only','then','than'}
    return {w for w in re.findall(r'[a-zA-Z0-9_]{3,}', text.lower()) if w not in stop}
