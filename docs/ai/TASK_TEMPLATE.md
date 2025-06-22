# Task specification template

Copy to `docs/specs/NNNN-short-name.md`. Written and agreed before implementation.

---

# NNNN - Title

**Status:** draft | agreed | implemented | superseded
**Author:**
**Date:**

## Product request

One paragraph, in the words of the person who wants it. Describe the situation, not the solution.

## Clarified requirement

What that actually means once the ambiguity is resolved.

## Scope

**In scope:**
-

**Out of scope:** (be specific; this is what stops the task growing while it is being built)
-

## Affected systems

| System | Change |
|--------|--------|
| `apps/api` | |
| `apps/web` | |
| `apps/ios` | |
| `apps/android` | |
| `packages/contracts` | |
| Database | |

## Assumptions

Decisions made in the absence of an answer. This section being empty usually means something was
assumed silently.

-

## Acceptance criteria

Each one checkable by running or reading something specific.

- [ ] AC1
- [ ] AC2

## Security and privacy analysis

- **New data collected:**
- **Who can see it:**
- **Retention:**
- **New authorisation decision:**
- **New attack surface:**
- **Threat-model entry affected:**
- **Personal data anywhere near a log or an audit record:**

## Test plan

| Level | Test | Covers |
|-------|------|--------|
| Unit | | |
| Integration | | |
| End-to-end | | |
| Failure path | | |

Failure paths are not optional. A feature with only happy-path tests is not specified, it is
described.

## Task decomposition

Each small enough to review in one sitting.

1.
2.

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Tests written, including failure paths, and passing
- [ ] Lint and type-check clean
- [ ] Authorisation checked in the service layer
- [ ] Nothing sensitive added to a log or an audit record
- [ ] PRIVACY.md updated if new personal data is collected
- [ ] Documentation updated
- [ ] `AI_WORKLOG.md` updated if an agent was involved

## Rollout

Migration order, backward-compatibility notes, feature-flag plan, rollback plan.
