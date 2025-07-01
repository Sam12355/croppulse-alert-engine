# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning is
[semantic](https://semver.org/).

## [Unreleased]

### Planned
- Per-provider circuit breakers, so a failing provider is skipped rather than retried into
- Webhook delivery receipts, to close the gap between provider acceptance and delivery
- Provider-specific failure mapping, for providers that return 500 on a malformed address

## [0.1.0] - 2026-03

### Added
- Retry policy with exponential backoff and full, equal or no jitter
- Failure classification across transient, throttled and permanent
- Retry-After honoured and capped at the policy ceiling
- Dead-lettering on budget exhaustion and immediately on a permanent failure
- Deduplication keyed on alert and recipient, checked at send time
- Escalation chains with a window measured from the last send, a step limit, and a stop on
  any acknowledgement
- Per-recipient rate limiting over a rolling window

### Verification

44 tests, executed, passing. Lint and type-check clean. Time and randomness injected, so
no test waits. Recorded output in `docs/test-results/`.
