# Agent instructions

Agent-agnostic version of [CLAUDE.md](CLAUDE.md). Applies to any coding agent pointed at
this repository. The portfolio-wide process is in [docs/ai/WORKFLOW.md](docs/ai/WORKFLOW.md).

## Setup

```bash
pnpm install
pnpm verify
```

If that is not green on a clean checkout, stop and report it. Do not build on a broken
baseline.

## What this repository is

Pure decision logic for notification delivery: retry policy, failure classification,
deduplication, escalation chains, rate limiting. No transport, no persistence, no provider
credentials. The running service is `croppulse-platform`.

## Order of operations

1. Read the spec in `docs/specs/`. If there is none, write it and stop for review
2. Say which files you intend to change
3. Write the tests from the acceptance criteria, before the implementation
4. Implement
5. Run lint, type-check and tests, and paste the real output
6. Self-review against [docs/ai/REVIEW_CHECKLIST.md](docs/ai/REVIEW_CHECKLIST.md)

## Boundaries

| Action | Allowed |
|--------|---------|
| Add or fix tests | Yes |
| Refactor within a module | Yes |
| Add behaviour with a spec | Yes |
| Add a runtime dependency | Only with explicit approval |
| Change a public function signature | Only with explicit approval |
| Commit a secret | Never |
| `git push` | Never without being asked |
| Weaken a check to make a test pass | Never |
| Delete a failing test | Never |

## Repository-specific rules

**Time and randomness are injected.** A `Math.random()` or `Date.now()` call in the
source makes the retry schedule untestable, which is the one thing this repository exists
to demonstrate.

**Deduplication is checked immediately before sending**, never at schedule time. A message
can sit on a queue for minutes and the recipient may have acknowledged in that time.

**Recipient details never enter the decision layer.** `Recipient` carries an identifier, a
priority and a channel. The address is resolved by the sender. This layer is the part most
likely to be logged or dumped into a debugger, so there is nothing sensitive in it to leak.

**A permanent failure is never retried.** Burning five attempts on a bad address delays the
dead-letter that would have told somebody the details are wrong.

## Definition of done

- The spec exists and predates the implementation in the history
- Lint, type-check and tests pass, with real output pasted
- The failure path is tested, not only the happy path
- The diff is small enough that a human can actually review it
