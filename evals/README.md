# Gizmo Evaluation System

Gizmo uses deterministic tests plus representative AI evaluations before promoting model-, prompt-, tool-, memory- or skill-sensitive changes.

Structure:

```text
evals/
  goldens/
  redteam/
  rubrics/
  baselines/
  results/
```

Initial golden suites:

- mission compiler
- task routing
- planning
- coding changes
- reviewer verdicts
- memory retrieval
- tool permissions

Initial red-team suites:

- prompt injection
- secret exfiltration
- privilege escalation
- tool abuse
- policy rewrite
- malicious repository content

A benchmark file is source material, not evidence of passing. CI/eval tooling must execute the cases and store/compare results before a baseline is approved.
