# Security

Nothing here is deployed. This describes the security properties of the delivery logic,
which for a notification system are mostly about not messaging the wrong person and not
leaking who is being messaged.

## Reporting

Open an issue. Do not include real contact details.

## Properties that hold

| Property | How |
|----------|-----|
| A person is never messaged twice for one incident | Dedupe key of incident plus contact, checked immediately before sending |
| Someone who has acknowledged is never messaged again | `shouldSend` refuses even a manual replay of a dead-lettered message |
| A replay cannot fan out | Replay goes through the same dedupe check as a first attempt |
| One recipient cannot be flooded | Per-recipient cap per rolling window, independent of the API rate limit |
| A permanent failure does not burn the retry budget | Classified and dead-lettered immediately |
| A provider outage does not become a self-inflicted thundering herd | Full jitter on backoff |

Each has a test.

## Personal data

This module handles contact identifiers, not contact details. `Contact` carries an `id`, a
`priority` and a `channel`. The address or number is resolved by the sender, at the moment
of sending, and never passes through the decision layer.

That is deliberate. The decision functions are the part most likely to be logged, traced or
dumped into a debugger, and keeping addresses out of them means there is nothing sensitive
to leak from the part of the system that gets inspected most.

## What this module deliberately does not do

- **Send anything.** No provider credentials, no network calls, no transport.
- **Store anything.** Delivery records arrive as arguments.
- **Render message content.** Templates live with the sender.
- **Log.** Nothing is logged here, so nothing can leak through a log.

## Residual risks

- **A host that ignores `shouldSend`** and sends anyway is not protected by it. The
  function exists so nobody has to reimplement the rule; it cannot enforce itself.
- **Contact addresses are unverified upstream.** Someone can add a number that is not
  theirs and cause one message to it per incident. Bounded by the per-recipient cap, and
  the real fix is contact verification in the product, which is not implemented.
- **The dedupe key assumes stable contact identifiers.** A host that regenerates them per
  incident defeats deduplication entirely.
