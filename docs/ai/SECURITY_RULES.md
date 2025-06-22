# Security rules for AI-assisted changes

Hard rules. A change that breaks one of these is rejected regardless of whether it works.

## Never

1. Write a secret, key, token, certificate or password into any file in this repository, including a
   test, a fixture, a comment, or an example that merely looks real.
2. Weaken, remove or bypass an authorisation check to make a test pass.
3. Delete or loosen a failing test instead of fixing what it caught.
4. Log a coordinate, an email address, a phone number, a name, a token or a message body.
5. Add personal data to an audit record. That table outlives every retention setting in the product.
6. Return internal detail in an error message: stack traces, SQL, connection strings, file paths.
7. Add a `DELETE` or `UPDATE` path to `incident_events` or `audit_records`.
8. Trust a role, a user id or a tenant from a request body, a query string or a header.
9. Disable TLS verification, or pin to an insecure algorithm.
10. Push, deploy, create a cloud resource, or send data to a real external service.

## Always

1. Check ownership in the service layer, where the record is loaded. The guard is not enough.
2. Validate input against a schema in `packages/contracts`, with a length cap on free text.
3. Return 404 rather than 403 for a resource belonging to someone else.
4. Pin the algorithm when verifying a JWT, and check issuer and audience.
5. Compare secrets in constant time.
6. Carry an expected version on any mutation of a versioned aggregate.
7. Deduplicate any endpoint a client will retry.
8. Write the outbox row in the same transaction as the state it describes.
9. Give a new token the narrowest scope and the shortest lifetime that works.
10. Update PRIVACY.md when new personal data is collected, including its retention period.

## Questions to ask about every diff

- If a caller substitutes another user's identifier here, what happens?
- If this request arrives five times, what happens?
- If this runs twice concurrently, what happens?
- If the external call fails halfway, what state is left behind?
- What is now in a log that was not before?
- Who can see this that could not see it yesterday?
- What does this look like on a device that has been offline for an hour?

## Sensitive areas

Changes here need a spec and a note in the pull request describing the threat considered:

- `application/services/identity.service.ts` and anything under `infrastructure/security/`
- The authorisation predicate in `application/services/incident.service.ts`
- `infrastructure/http/http-plumbing.ts` guards and the idempotency interceptor
- `application/services/privacy.service.ts`, particularly `executeDeletion`
- `infrastructure/realtime/realtime.gateway.ts` subscription authorisation
- The logger redaction list
- Any migration touching `audit_records` or `incident_events`
