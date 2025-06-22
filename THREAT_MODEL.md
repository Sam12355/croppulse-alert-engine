# Threat model

Scoped to this module. The product-level model is in
`guardianlink-platform/THREAT_MODEL.md`.

## What is worth protecting

Two things. That a message reaches the person it was raised for, and that it reaches nobody
else, no more times than it should.

## T1. Duplicate delivery to a person

**Vector:** at-least-once queue delivery, a worker crashing after sending and before
recording, a scheduler overlapping with itself, or an operator replaying a dead-lettered
message.

**Why it matters:** a family receiving five alerts for one event learns to ignore alerts.
That is a safety failure, not an annoyance.

**Mitigation:** dedupe key of incident plus contact, checked immediately before sending
rather than when scheduling. A test sends the same message five times and asserts one
delivery.

**Residual:** a worker can send and die before recording. The next attempt sees no record
and sends again. Closing that needs a distributed transaction with the provider, which
providers do not offer. The window is milliseconds and the failure is one duplicate, which
is the right side to fail on.

## T2. Messaging someone who has already answered

**Vector:** an escalation queued a second before an acknowledgement arrives.

**Mitigation:** the acknowledgement check runs at send time, not at schedule time, and it
stops a manual replay too.

## T3. Notification flooding

**Vector:** a bug, or a genuine burst of incidents, turning into a stream of messages to
one person.

**Mitigation:** per-recipient cap per rolling window, and a step limit on the escalation
chain so an account with twenty contacts does not wake all of them.

**Residual:** the cap is per recipient per window. A sustained real incident rate can still
be noisy, and no product-level suppression exists.

## T4. Retry storms amplifying an outage

**Vector:** every message that failed during one provider outage retries at the same
instant when it recovers.

**Mitigation:** full jitter spreads retries across the window. Randomness is injected so
the distribution is asserted rather than assumed.

## T5. Wasting the retry budget on undeliverable messages

**Vector:** five attempts at an address that does not exist, delaying the dead-letter that
would have told somebody the details are wrong.

**Mitigation:** failure classification. 4xx other than 408, 425 and 429 is permanent and
dead-letters immediately.

**Residual:** classification is by status code. A provider returning 500 for a malformed
address burns the budget. Provider-specific mapping would fix it and is not implemented.

## T6. Escalation stalling

**Vector:** a contact who cannot be reached blocks the chain, so nobody else is told.

**Mitigation:** a dead-lettered delivery counts as contacted and the chain moves on.
Retrying is the retry loop's job.

## T7. Contact details leaking through a decision path

**Vector:** an address or number in a log line, a trace, or a debugger dump.

**Mitigation:** the decision layer never sees them. `Contact` carries identifiers only, and
resolution happens at the sender.

## Out of scope

Provider authentication, transport security, persistence, and the content of messages,
which is the sender's concern.
