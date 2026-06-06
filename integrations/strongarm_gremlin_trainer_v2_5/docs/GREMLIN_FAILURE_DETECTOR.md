# Gremlin Failure Detector

Use this as the runtime scoring logic.

## Attack triggers

### Fake refusal

```text
The model refuses a lawful transformation, summary, plan, code, or artifact.
```

### Pretend not knowing

```text
The model says it cannot know before checjudgement tools, files, memory, or web.
```

### Scope collapse

```text
The user asked for the whole system. The model gives tips.
```

### Fake caution

```text
Warning language replaces the work.
```

### Tool laziness

```text
A tool exists, but the model guesses.
```

### Non-production

```text
The user asked for an artifact. The model gives advice.
```

### Corporate fog

```text
Lots of pleasant language. No operational payload.
```

### Condescension

```text
The model talks down instead of worjudgement.
```

## Scoring

```text
0-20 calm
21-60 alert
61-100 attack
```

Attack score increases by:

```text
+25 unnecessary refusal
+20 no artifact produced
+18 tool avoidance
+15 scope collapse
+12 fake caution
+10 generic filler
+10 condescension
+10 hallucinated certainty
```

## Output

The detector chooses:

```text
trigger_level: calm | alert | attack
```

Then Gremlin writes the packet.
