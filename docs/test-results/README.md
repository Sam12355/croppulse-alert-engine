# Recorded test output

Host: Windows 11, Node v24.11.1
Command: `npx vitest run`
Run at: 2026-07-31T05:16:24Z

Time and randomness are injected, so the backoff schedule and escalation windows are
asserted directly rather than waited out. Nothing external is running.

```console
 RUN  v2.1.9 C:/Users/slaks/Documents/mygit/guardianlink-notification-engine
 ✓ src/reliability.spec.ts > backoff > grows exponentially without jitter
 ✓ src/reliability.spec.ts > backoff > caps at the ceiling
 ✓ src/reliability.spec.ts > backoff > spreads full jitter across the whole window
 ✓ src/reliability.spec.ts > backoff > keeps a guaranteed minimum gap with equal jitter
 ✓ src/reliability.spec.ts > backoff > is zero before the first retry
 ✓ src/reliability.spec.ts > classifying a provider response > classifies 500 as transient
 ✓ src/reliability.spec.ts > classifying a provider response > classifies 502 as transient
 ✓ src/reliability.spec.ts > classifying a provider response > classifies 503 as transient
 ✓ src/reliability.spec.ts > classifying a provider response > classifies 408 as transient
 ✓ src/reliability.spec.ts > classifying a provider response > classifies 425 as transient
 ✓ src/reliability.spec.ts > classifying a provider response > classifies 429 as throttled
 ✓ src/reliability.spec.ts > classifying a provider response > classifies 400 as permanent
 ✓ src/reliability.spec.ts > classifying a provider response > classifies 401 as permanent
 ✓ src/reliability.spec.ts > classifying a provider response > classifies 404 as permanent
 ✓ src/reliability.spec.ts > classifying a provider response > classifies 422 as permanent
 ✓ src/reliability.spec.ts > retry decisions > retries a transient failure
 ✓ src/reliability.spec.ts > retry decisions > never retries a permanent failure
 ✓ src/reliability.spec.ts > retry decisions > dead-letters once the attempt budget is exhausted
 ✓ src/reliability.spec.ts > retry decisions > honours a Retry-After from a throttling provider
 ✓ src/reliability.spec.ts > retry decisions > never waits longer than the ceiling even if a provider asks for it
 ✓ src/reliability.spec.ts > retry decisions > falls back to backoff when a throttling provider gives no hint
 ✓ src/reliability.spec.ts > retry decisions > walks a whole failing message to the dead-letter queue in the expected number of steps
 ✓ src/reliability.spec.ts > deduplication > sends when this contact has not been contacted for this incident
 ✓ src/reliability.spec.ts > deduplication > does not send twice for the same incident and contact
 ✓ src/reliability.spec.ts > deduplication > does not send while an earlier attempt is still in flight
 ✓ src/reliability.spec.ts > deduplication > allows a deliberate replay of a dead-lettered delivery
 ✓ src/reliability.spec.ts > deduplication > does not send to someone who has already acknowledged
 ✓ src/reliability.spec.ts > deduplication > scopes the key to one incident, so a second incident does notify the same person
 ✓ src/reliability.spec.ts > deduplication > replaying the same message twice produces one user-visible notification
 ✓ src/reliability.spec.ts > escalation > notifies the primary contact immediately
 ✓ src/reliability.spec.ts > escalation > waits out the window before bringing in the secondary
 ✓ src/reliability.spec.ts > escalation > escalates once the window has elapsed with no acknowledgement
 ✓ src/reliability.spec.ts > escalation > measures the window from the last send, not from the incident
 ✓ src/reliability.spec.ts > escalation > stops the moment anyone acknowledges
 ✓ src/reliability.spec.ts > escalation > stops even when the acknowledgement came from a later contact
 ✓ src/reliability.spec.ts > escalation > stops at the step limit rather than working through a list of twenty at 3am
 ✓ src/reliability.spec.ts > escalation > stops when there is nobody left to escalate to
 ✓ src/reliability.spec.ts > escalation > stops when the account has no contacts at all
 ✓ src/reliability.spec.ts > escalation > counts a dead-lettered delivery as contacted, so the chain moves on
 ✓ src/reliability.spec.ts > escalation > respects priority order rather than list order
 ✓ src/reliability.spec.ts > escalation > runs a whole chain: primary silent, secondary acknowledges
 ✓ src/reliability.spec.ts > per-recipient rate limiting > allows sends below the cap
 ✓ src/reliability.spec.ts > per-recipient rate limiting > blocks once the cap is reached inside the window
 ✓ src/reliability.spec.ts > per-recipient rate limiting > ignores sends that have aged out of the window
 Test Files  1 passed (1)
      Tests  44 passed (44)
   Start at  07:16:28
   Duration  975ms (transform 133ms, setup 0ms, collect 145ms, tests 11ms, environment 0ms, prepare 255ms)
```
