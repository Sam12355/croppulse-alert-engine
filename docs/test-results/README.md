# Recorded test output

Host: Windows 11, Node v24.11.1
Command: `npx jest --config jest.config.js --runInBand --verbose`
Run at: 2026-07-31T09:35:12Z

Two projects. `unit` covers the pure decision logic; `integration` boots the real Nest
application in-process and drives it over HTTP with supertest. Neither needs Postgres or
Redis running: the in-memory store enforces the same guarantees.

```console
PASS integration test/service.spec.ts
  the service runs
    √ answers a health check (393 ms)
  escalation over HTTP
    √ notifies the primary recipient immediately (41 ms)
    √ waits out the window before bringing in the secondary (16 ms)
    √ escalates once the window has elapsed with no acknowledgement (20 ms)
    √ stops the chain the moment somebody acknowledges (23 ms)
    √ runs a whole chain and never notifies the same person twice (26 ms)
  deduplication over HTTP
    √ draining repeatedly sends one message, not one per drain (20 ms)
    √ does not send again after an acknowledgement, even on a replay (42 ms)
  retries and dead-lettering over HTTP
    √ retries a transient failure rather than giving up (12 ms)
    √ dead-letters a permanent failure immediately, without burning the budget (8 ms)
    √ exposes dead letters with their failure reason (13 ms)
    √ replays a dead-lettered message safely (24 ms)
    √ returns 404 replaying something that is not dead-lettered (5 ms)
  what the delivery endpoint exposes
    √ returns identifiers and status, never recipient details (9 ms)
PASS unit src/reliability.spec.ts
  backoff
    √ grows exponentially without jitter (1 ms)
    √ caps at the ceiling
    √ spreads full jitter across the whole window
    √ keeps a guaranteed minimum gap with equal jitter (1 ms)
    √ is zero before the first retry
  classifying a provider response
    √ classifies 500 as transient
    √ classifies 502 as transient
    √ classifies 503 as transient
    √ classifies 408 as transient
    √ classifies 425 as transient (1 ms)
    √ classifies 429 as throttled
    √ classifies 400 as permanent
    √ classifies 401 as permanent
    √ classifies 404 as permanent
    √ classifies 422 as permanent
  retry decisions
    √ retries a transient failure
    √ never retries a permanent failure (1 ms)
    √ dead-letters once the attempt budget is exhausted
    √ honours a Retry-After from a throttling provider
    √ never waits longer than the ceiling even if a provider asks for it
    √ falls back to backoff when a throttling provider gives no hint (1 ms)
    √ walks a whole failing message to the dead-letter queue in the expected number of steps
  deduplication
    √ sends when this recipient has not been contacted for this alert (1 ms)
    √ does not send twice for the same alert and recipient
    √ does not send while an earlier attempt is still in flight
    √ allows a deliberate replay of a dead-lettered delivery
    √ does not send to someone who has already acknowledged
    √ scopes the key to one alert, so a second alert does notify the same person (1 ms)
    √ replaying the same message twice produces one user-visible notification
  escalation
    √ notifies the primary recipient immediately
    √ waits out the window before bringing in the secondary
    √ escalates once the window has elapsed with no acknowledgement (1 ms)
    √ measures the window from the last send, not from the alert
    √ stops the moment anyone acknowledges
    √ stops even when the acknowledgement came from a later recipient
    √ stops at the step limit rather than working through a list of twenty at 3am (1 ms)
    √ stops when there is nobody left to escalate to
    √ stops when the account has no recipients at all
    √ counts a dead-lettered delivery as contacted, so the chain moves on
    √ respects priority order rather than list order
    √ runs a whole chain: primary silent, secondary acknowledges (1 ms)
  per-recipient rate limiting
    √ allows sends below the cap
    √ blocks once the cap is reached inside the window
    √ ignores sends that have aged out of the window
Test Suites: 2 passed, 2 total
Tests:       58 passed, 58 total
Snapshots:   0 total
Time:        5.607 s, estimated 16 s
Ran all test suites in 2 projects.
```

Re-recorded on 2026-07-31 after the domain rename. The previous transcript had its
identifiers rewritten along with the code, which would have left text no run ever printed.

## Not executed

| Item | Why |
|------|-----|
| Against real Postgres or Redis | The default adapters are in-memory. `docker compose up` starts both for driving it by hand |
| Docker image build | Dockerfile written; not built on this machine |
| Load test | No throughput number is claimed anywhere in this repository |
| Deployed anywhere | Never |
