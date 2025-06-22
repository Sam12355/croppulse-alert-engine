# Review checklist

Worked through on every change, generated or hand-written. Ordered by how expensive the mistake is,
not by how likely it is.

## Security

- [ ] Does every new read and write check ownership **in the service layer**, where the record is
      loaded, and not only in the route guard?
- [ ] Does a request for someone else's resource return 404 rather than 403? A 403 confirms it exists.
- [ ] Is a role read from a verified token claim, never from a request body or a header?
- [ ] Are new inputs validated by a schema in `packages/contracts`, with a length cap?
- [ ] Can a new identifier in a URL be enumerated to learn something?
- [ ] Does any new token carry more authority than the narrowest thing that would work?
- [ ] Is there a new place a secret could be written to disk or a log?

## Privacy

- [ ] Any coordinate, email address, phone number, name or message body added to a log line?
- [ ] Any of the above added to an audit record? That table outlives every retention setting.
- [ ] Any new personal data collected? If so, is it in PRIVACY.md with a retention period?
- [ ] Does the data-export path include the new data?
- [ ] Does account deletion remove or anonymise it?
- [ ] Is a new error message revealing something the caller should not know?

## Error handling

- [ ] Are expected failures returned as `Result`, not thrown?
- [ ] Is a new `DomainErrorCode` mapped in `error-mapper.ts`? The exhaustive switch will not compile
      until it is, but check that the status chosen is the right one.
- [ ] Does the failure path have a test?
- [ ] Is anything swallowing an error and continuing as if it succeeded?

## Concurrency

- [ ] Does every mutation carry an expected version?
- [ ] Is there a check-then-write that two concurrent callers could both pass?
- [ ] Does anything hold a lock or a lease with no expiry?
- [ ] If two operators do this simultaneously, does one get a clear conflict rather than a silent
      overwrite?

## Data consistency

- [ ] Are state changes that must happen together in one transaction?
- [ ] Is the outbox row written in the same transaction as the state it describes?
- [ ] Is the migration forward-only, additive, and safe to run while the previous version serves
      traffic?
- [ ] Can an event sequence be allocated by anything other than the writing transaction?

## Idempotency

- [ ] Will a client retry this? If so, does a retry produce one outcome?
- [ ] Is the dedupe key derived from something stable across retries, not generated at send time?
- [ ] Does replaying a dead-lettered message reach a person twice?

## Accessibility

- [ ] Reachable and operable by keyboard, in a sensible order?
- [ ] Focus visible, and never removed rather than restyled?
- [ ] Labelled for a screen reader, with state announced when it changes?
- [ ] Colour contrast within AA? The token test will fail the build, but check custom values.
- [ ] Does it work at 200 percent text size and under Dynamic Type?
- [ ] Is motion suppressed under `prefers-reduced-motion`?

## Performance

- [ ] Any query inside a loop?
- [ ] Any unbounded read? Every list needs a limit.
- [ ] Any new index needed for a query this introduces?
- [ ] Does a large payload get streamed or paginated rather than assembled in memory?

## Maintainability

- [ ] Does the layering hold: domain imports nothing, application imports ports only?
- [ ] Is the name accurate? A method called `getUser` that also writes something is a trap.
- [ ] Do comments explain **why**, not what? A comment restating the code is a maintenance liability.
- [ ] Is a new abstraction earning its place, or is it one caller pretending to be a pattern?

## Backward compatibility

- [ ] Any field removed or renamed in a contract? Mobile clients ship on store timelines and cannot
      be updated in lockstep.
- [ ] Any enum value added that an old client will not recognise?
- [ ] Does a new required request field break an older client?

## Test coverage

- [ ] Does the test describe behaviour, or does it describe the implementation?
- [ ] Would this test fail if the bug it is meant to catch were reintroduced?
- [ ] Is the failure path covered at the same level as the happy path?
- [ ] Does the suite still run with no external services?
- [ ] Any `sleep`, or any dependence on real wall-clock time?

## For generated code specifically

- [ ] Was there a spec, and does it predate the implementation in the history?
- [ ] Was the diff read line by line, or accepted because it compiled?
- [ ] Did the agent invent an API that does not exist? Confident wrong imports are common.
- [ ] Is there a plausible-looking comment asserting something the code does not actually do?
- [ ] Was a test changed to match the implementation rather than the implementation fixed?
- [ ] Does `AI_WORKLOG.md` record what was rejected? If nothing was, was anyone actually reviewing?
