/**
 * Retry policy, backoff, and the decision to stop.
 *
 * The thing this gets right that a naive retry loop does not: jitter. Without it, every
 * message that failed during the same provider outage retries at the same instant, and
 * the recovering provider gets the entire backlog in one spike. That is how a brief
 * outage becomes a long one.
 *
 * Randomness is injected rather than taken from Math.random(), so the schedule is
 * asserted in tests instead of described in a comment.
 */

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly strategy: 'full-jitter' | 'equal-jitter' | 'none';
}

export const DEFAULT_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 2_000,
  // Ten minutes. Past that a message is not going to be delivered by waiting, and holding
  // it in the retry loop only delays the point at which a human looks at it.
  maxDelayMs: 600_000,
  strategy: 'full-jitter',
};

/**
 * Delay before attempt number `attempt`, where the first retry is attempt 1.
 *
 * `random` is a value in [0, 1). Full jitter spreads retries across the whole window,
 * which is the variant that actually decorrelates a fleet; equal jitter keeps half the
 * backoff and randomises the rest, which is better when you want a guaranteed minimum
 * gap between attempts.
 */
export function backoffMs(policy: RetryPolicy, attempt: number, random: number): number {
  if (attempt <= 0) return 0;

  const exponential = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);

  switch (policy.strategy) {
    case 'none':
      return exponential;
    case 'equal-jitter':
      return Math.floor(exponential / 2 + (exponential / 2) * random);
    case 'full-jitter':
      return Math.floor(exponential * random);
    default: {
      const exhaustive: never = policy.strategy;
      void exhaustive;
      return exponential;
    }
  }
}

export type FailureClass =
  /** The provider is down or rate limiting us. Worth retrying. */
  | 'transient'
  /** The request is wrong: bad address, malformed payload. Retrying cannot help. */
  | 'permanent'
  /** We are being throttled and told when to come back. */
  | 'throttled';

export interface AttemptOutcome {
  readonly attempt: number;
  readonly failure: FailureClass;
  /** From a Retry-After header, when the provider gave one. */
  readonly retryAfterMs?: number | undefined;
}

export type RetryDecision =
  | { readonly action: 'retry'; readonly delayMs: number; readonly attempt: number }
  | { readonly action: 'dead-letter'; readonly reason: string };

export function decide(
  policy: RetryPolicy,
  outcome: AttemptOutcome,
  random: number,
): RetryDecision {
  // A permanent failure is not retried at all. Five attempts at an address that does not
  // exist wastes the budget and delays the point at which somebody notices the contact
  // details are wrong.
  if (outcome.failure === 'permanent') {
    return { action: 'dead-letter', reason: 'permanent failure, retrying cannot help' };
  }

  if (outcome.attempt >= policy.maxAttempts) {
    return {
      action: 'dead-letter',
      reason: `exhausted ${policy.maxAttempts} attempts`,
    };
  }

  const nextAttempt = outcome.attempt + 1;

  // A provider that tells us when to come back knows better than our backoff curve does.
  // Honour it, but never wait longer than the policy ceiling.
  if (outcome.failure === 'throttled' && outcome.retryAfterMs !== undefined) {
    return {
      action: 'retry',
      delayMs: Math.min(outcome.retryAfterMs, policy.maxDelayMs),
      attempt: nextAttempt,
    };
  }

  return {
    action: 'retry',
    delayMs: backoffMs(policy, outcome.attempt, random),
    attempt: nextAttempt,
  };
}

/**
 * Classifies a provider response.
 *
 * Getting this wrong in either direction is expensive: treating a transient failure as
 * permanent loses a message that would have gone through, and treating a permanent one as
 * transient burns the retry budget and delays the dead-letter that would have told
 * somebody the address is wrong.
 */
export function classify(statusCode: number): FailureClass {
  if (statusCode === 429) return 'throttled';
  if (statusCode >= 500) return 'transient';

  // 408 and 425 are the client-side codes that are genuinely worth retrying.
  if (statusCode === 408 || statusCode === 425) return 'transient';

  if (statusCode >= 400) return 'permanent';

  return 'transient';
}
