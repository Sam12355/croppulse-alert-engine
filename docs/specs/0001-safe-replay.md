# 0001 - Safe replay of a dead-lettered notification

**Status:** implemented
**Date:** 2026-03

## Product request

> A batch of alerts failed overnight because the SMS provider was down. We want to be able
> to send them once the provider is back, but I do not want somebody getting an alert twice
> for the same incident, and I definitely do not want to message anyone who has already
> replied.

## Clarified requirement

An operator can replay a dead-lettered message. The replay is safe: a person who has already
been messaged for that incident is not messaged again, and a person who has acknowledged is
not messaged at all.

## Scope

**In scope:** the dedupe decision, its interaction with acknowledgement, the classification
that decides what is dead-lettered in the first place, and the retry schedule that gets it
there.

**Out of scope:** the queue, the dead-letter queue itself, the replay tooling, and the
provider adapters.

## Assumptions

- **Contact identifiers are stable across incidents.** A host that regenerates them per
  incident defeats deduplication entirely, and there is nothing this module can do about it.
- **The delivery record is authoritative.** If it says a message was sent, it was.
- **Five attempts is the right budget.** A guess, matched to the SQS `maxReceiveCount` in
  the flagship. If those two disagree, one of them gives up while the other is still trying.

## Acceptance criteria

- [x] AC1: a first send for an incident and contact proceeds
- [x] AC2: a second send for the same incident and contact is suppressed
- [x] AC3: a send while an earlier attempt is in flight is suppressed
- [x] AC4: a replay of a dead-lettered delivery proceeds
- [x] AC5: a replay is suppressed if that contact has acknowledged, even manually triggered
- [x] AC6: the key is scoped per incident, so a second incident does notify the same person
- [x] AC7: five replays of one message produce exactly one delivery
- [x] AC8: a permanent failure is dead-lettered without consuming the retry budget
- [x] AC9: a transient failure retries with jittered backoff up to the budget

## Security and privacy analysis

- **New data collected:** none. Delivery records arrive as arguments.
- **Who can see it:** nobody. This module returns a decision.
- **New authorisation decision:** none. Whether an operator may replay is the host's call.
- **New attack surface:** a replay endpoint is a way to send messages. Bounded here by the
  dedupe rule and the per-recipient cap; the endpoint itself needs authorisation, which is
  the host's responsibility and is stated as such.
- **Personal data near logs:** none. `Contact` carries identifiers, never addresses.

## Test plan

| Level | Test | Covers |
|-------|------|--------|
| Unit | First send, repeat, in-flight, dead-letter replay, acknowledged, per-incident scoping | AC1 to AC6 |
| Unit | Five replays in a loop, asserting one delivery | AC7 |
| Unit | Permanent failure classified and dead-lettered | AC8 |
| Unit | Full walk from attempt 1 to dead-letter, asserting the attempt count | AC9 |

AC7 is the one that matters. It is the whole reliability claim reduced to a single
assertion, and if it regresses a family gets five alerts for one event.

## Definition of Done

- [x] Criteria met
- [x] Tests written from this document before the implementation
- [x] Lint and type-check clean
- [x] No contact address anywhere in the decision layer
- [x] Randomness and time remain injected
