import json
import urllib.request

def run_strongarm_council(request, mode="normal", context_digest="", heuristic=False):
    payload = {
        "request": request,
        "mode": mode,
        "context_digest": context_digest,
        "heuristic": heuristic
    }
    req = urllib.request.Request(
        "http://127.0.0.1:8095/run",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode("utf-8"))
