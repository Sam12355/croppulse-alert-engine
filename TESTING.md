# Testing

## Running it

```bash
pnpm test          # 44 tests, about a second
```

Nothing external. Time and randomness are both injected, so backoff schedules and
escalation windows are asserted directly rather than waited out. There is no sleep in the
suite.

## What is covered

| Area | Cases |
|------|-------|
| Backoff | Exponential growth, ceiling, full-jitter spread, equal-jitter floor, zero before the first retry |
| Classification | Ten status codes across transient, throttled and permanent |
| Retry decisions | Transient retried, permanent never retried, budget exhaustion, Retry-After honoured and capped, a full walk to dead-letter |
| Deduplication | First send, repeat suppressed, in-flight suppressed, dead-letter replay allowed, acknowledged never re-sent, per-incident scoping, five replays produce one delivery |
| Escalation | Immediate primary, window wait, escalation on silence, window measured from last send, stop on any acknowledgement, step limit, no contacts, dead-lettered counts as contacted, priority order, a full chain |
| Rate limiting | Under cap, at cap, aged-out sends ignored |

## The four that matter most

**"replaying the same message twice produces one user-visible notification".** The whole
reliability argument reduces to this one assertion. If it fails, at-least-once delivery
becomes visible to the people receiving the messages, and a family gets five alerts for one
event. That is a safety failure, not an annoyance.

**"does not send to someone who has already acknowledged".** Including through a manual
replay of a dead-lettered message. Messaging someone who has already answered is worse than
not messaging them at all.

**"measures the window from the last send, not from the first".** A slow first delivery
must not eat the time the second contact gets.

**"spreads full jitter across the whole window".** Jitter is the difference between a brief
provider outage and a long one. Without an injected random source it cannot be asserted at
all, only described in a comment and hoped for.

## Conventions

Randomness is a parameter, so a schedule is checked at 0, 0.5 and 0.999 rather than sampled
and hoped over.

Tests are named after the failure prevented, and written from the acceptance criteria before
the implementation.

## Deliberately not tested

- **Real providers.** The adapters are tested against fakes. The providers are not mine to
  test, and a test that hits a live provider is a test that fails when their status page
  goes yellow.
- **Throughput.** A load script exists. Running it against mock providers measures the
  mock, so no throughput number appears anywhere in this repository.
- **The queue itself.** SQS at-least-once behaviour is assumed rather than verified. The
  consumer is built to tolerate it, and that tolerance is what is tested.
