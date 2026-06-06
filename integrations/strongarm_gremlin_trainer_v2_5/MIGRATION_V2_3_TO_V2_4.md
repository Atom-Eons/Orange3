# Migration V2.3 → V2.4

Change:

```text
King → Judgement
```

Reason:

```text
No hidden leaders. No monarch layer. The final node is a visible judgement layer.
```

Config compatibility:

Older configs may still contain:

```json
"king_local": "..."
```

V2.4 prefers:

```json
"judgement_local": "..."
```

The runtime tries to tolerate both where possible.
