# What this changes

<!-- One or two sentences. What behaviour is different after this merges. -->

Closes #

## Specification

<!-- Link the spec in docs/specs/. Anything beyond a one-line fix should have one
     before the code was written, not after. -->

Spec: `docs/specs/`

## How it was verified

Tick only what you actually ran, and paste the output for anything that is not obvious.

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm --filter @guardianlink/api test`
- [ ] `pnpm --filter @guardianlink/api test:e2e`
- [ ] `pnpm --filter @guardianlink/web test`
- [ ] Android: `./gradlew testDebugUnitTest`
- [ ] iOS: `xcodebuild test`
- [ ] Ran it by hand against the local stack
- [ ] Not verified, and here is why:

## Review checklist

The reviewer works through `docs/ai/REVIEW_CHECKLIST.md`. The author fills this in first.

- [ ] **Authorisation**: every new read and write checks ownership in the service layer,
      not only the route guard
- [ ] **Privacy**: no personal data, coordinates or tokens added to a log line, an audit
      record or an error message
- [ ] **Errors**: expected failures return a domain error, not an exception
- [ ] **Concurrency**: mutations carry an expected version, or there is a note saying why not
- [ ] **Idempotency**: any endpoint a client will retry deduplicates
- [ ] **Accessibility**: keyboard reachable, labelled, contrast checked
- [ ] **Migrations**: forward-only, additive, safe to run while the old version is live
- [ ] **Backward compatibility**: no field removed or renamed without a deprecation path
- [ ] **Tests**: the failure path is covered, not only the happy path

## If AI assistance was used

- [ ] A written spec existed first
- [ ] Generated code was reviewed line by line, not accepted because it compiled
- [ ] `AI_WORKLOG.md` records what was rejected and what was corrected

## Anything the reviewer should look at hardest

<!-- Be specific. "The claim lease expiry logic" is useful; "all of it" is not. -->
