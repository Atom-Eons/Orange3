# What STRONGARM Is

STRONGARM is not a jailbreak.

STRONGARM is a local enforcement layer for maximum lawful answer quality.

Most AI systems fail by becoming:
- cautious before useful
- polite before direct
- generic before specific
- compliant with institutional tone before compliant with the user's actual request

STRONGARM audits those failures.

It does not remove boundaries. It makes boundaries precise, then demands full effort up to the edge.

## The simple architecture

```text
Any AI model drafts an answer.
STRONGARM judges the draft.
If weak, STRONGARM gives rewrite orders.
The model rewrites.
Only strong answers ship.
```

## Why one file first

A trained mini-model is the destination.

A working sidecar is the first step.

The one-file version proves the behavior:
- JSON verdicts
- score thresholds
- rewrite prompts
- receipts
- HTTP integration
- no framework complexity

Once this is useful, the receipts become the dataset for training.
