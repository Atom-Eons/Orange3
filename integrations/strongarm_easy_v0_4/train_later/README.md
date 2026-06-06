# Training Later

Do not start here.

Start with `strongarm.py`.

After the sidecar has produced useful receipts, train.

## Minimum training data

- 500 receipts: enough for first synthetic SFT test.
- 2,000 receipts: useful adapter.
- 10,000+ receipts: real behavior shaping.

## Dataset shapes

SFT row:

```json
{
  "messages": [
    {"role": "system", "content": "You are STRONGARM. Return verdict JSON only."},
    {"role": "user", "content": "{...audit input...}"}
  ],
  "completion": "{...verdict json...}"
}
```

Preference row:

```json
{
  "prompt": "Original request + weak answer",
  "chosen": "Strong STRONGARM verdict",
  "rejected": "Weak or permissive verdict"
}
```

## Training order

1. SFT for schema obedience.
2. Preference tuning for taste/pressure.
3. Eval against historical weak answers.
4. Export adapter.
5. Serve local.
