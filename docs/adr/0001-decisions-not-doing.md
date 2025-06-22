# ADR-0001: A pure decision core inside a thin service

**Status:** accepted
**Date:** 2026-03

## Context

The brief specifies NestJS, Postgres, Redis, SQS, Lambda, Docker, Terraform, CloudWatch and
OpenTelemetry for this repository. Building all of that reproduces the flagship's
notification path in a second place.

What makes notification delivery hard is not the plumbing. It is the decisions: is this a
duplicate, is this failure worth retrying, has this person already been reached, is it time
to escalate.

## Decision

Implement the decisions as pure functions with an exhaustive test suite, and wrap them in a
service thin enough that the controllers decide nothing. The production queue and the real
provider adapters stay in the flagship.

## Why

"Five replays of one message produce one delivery" is the central claim of this repository.
As a pure test it is a loop and an assertion. Through a running stack it needs a queue, a
database, a fake provider and a way to force redelivery, and it becomes an integration test
that is slow and occasionally flaky.

Retry timing is the sharper case. Asserting that backoff spreads across a jitter window
requires injecting the random source. Once randomness and time are parameters, the schedule
is checked at 0, 0.5 and 0.999 in a millisecond. With a real timer it is untestable and the
comment describing the behaviour is the only evidence it works.

There is also a security argument. Keeping addresses and provider credentials out of the
decision layer means the part of the system most likely to be logged, traced or inspected
in a debugger has nothing sensitive in it.

## Consequences

**Good.** 44 tests in a second. Failure modes that are hard to reproduce are trivial to
assert. The dedupe rule, which is the thing that must never regress, is covered from six
angles.

**Bad.** No throughput number can be published, because measuring against mock providers
measures the mock. The service runs, but running is not the same as being load-tested.

**Also bad.** Six of the eight delivery guarantees are enforced here; the two that need a
database transaction are not, so a reader has to go to the flagship to see the whole chain.
ARCHITECTURE.md has the table that maps them.

## What this bought

The HTTP suite is 14 tests and it found nothing the unit suite had not already covered. That
is the intended outcome: the HTTP tests prove the rules are reachable from the transport,
and the unit tests prove they are right.
