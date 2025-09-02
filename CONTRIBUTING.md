# Contributing

## Setup

```bash
pnpm install
pnpm verify     # lint, type-check, tests
```

Node 20 or newer and pnpm 9. Nothing else. If `pnpm verify` is not green on a clean
checkout, stop and report that rather than building on a broken baseline.

## The workflow

Specification first for anything beyond a one-line fix. `docs/specs/`, following
[docs/ai/TASK_TEMPLATE.md](docs/ai/TASK_TEMPLATE.md). It is not ceremony: it is what makes
review possible and what stops AI assistance turning into unreviewed code.

Small commits, Conventional Commits, one logical change each.

## Conventions specific to this repository

**Time and randomness are injected.** Backoff schedules and escalation windows are
asserted directly in tests rather than waited out. A `Math.random()` call in the source
makes the retry schedule untestable.

**Every decision function is pure.** `decide`, `nextEscalationStep` and `shouldSend`
take state and return a decision. The worker that acts on those decisions lives in the
flagship.

**Deduplication is checked immediately before sending**, never when scheduling. A message
can sit on a queue for minutes and the recipient may have acknowledged meanwhile.

## Tests

Named after the failure they prevent, not after the function they call. Failure paths are
covered at the same level as happy paths.

Tests are written **from the acceptance criteria, before the implementation**. A test
written afterwards asserts what the code does, which is not the same as what it should do.
That ordering has caught real bugs across this portfolio; the record is in
`estateflow-property-portal/AI_WORKLOG.md`.

## Before opening a pull request

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Then read your own diff against [docs/ai/REVIEW_CHECKLIST.md](docs/ai/REVIEW_CHECKLIST.md).

## Using an AI agent

Encouraged, with the conditions in [CLAUDE.md](CLAUDE.md) and
[docs/ai/SECURITY_RULES.md](docs/ai/SECURITY_RULES.md). A written spec comes first,
generated code is read line by line, and "it compiles" is not evidence of anything.
