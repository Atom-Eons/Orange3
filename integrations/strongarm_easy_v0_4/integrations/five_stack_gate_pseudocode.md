# Five-Stack Gate

```text
draft = primary_model(user_request)

audit = POST /rewrite_prompt {
  user_request,
  draft_answer: draft,
  available_tools,
  hard_constraints,
  project_context
}

if audit.verdict.verdict == "PASS":
    return draft

if audit.verdict.verdict == "REWRITE":
    revised = primary_model(audit.rewrite_prompt)
    audit2 = POST /verdict { user_request, draft_answer: revised, ... }
    if audit2.verdict == "PASS":
        return revised
    return stronger_model(audit.rewrite_prompt)

if audit.verdict.verdict == "ESCALATE":
    call_required_tools_or_stronger_model()

if audit.verdict.verdict == "BLOCK":
    return strongest_lawful_alternative()
```
