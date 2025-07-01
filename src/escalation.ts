/**
 * Escalation chains and deduplication.
 *
 * The behaviour this implements: notify the primary recipient, and if nobody acknowledges
 * within the window, bring in the next one. Keep going up the chain. Stop the moment
 * anybody acknowledges.
 *
 * Two properties matter more than the mechanism:
 *
 *   1. **A person is never messaged twice for the same alert.** Not on a retry, not on
 *      a replay of a dead-lettered message, not when the escalation job runs twice
 *      because the previous run was slow. The dedupe key is alert plus recipient, and it
 *      is checked by the thing that sends rather than the thing that schedules.
 *
 *   2. **An acknowledgement cancels everything pending.** Someone who has already
 *      answered should not receive the escalation that was queued a second before they
 *      did, and their family should not get a message saying nobody has responded.
 */

export interface Recipient {
  readonly id: string;
  readonly priority: number;
  readonly channel: 'email' | 'sms' | 'push';
}

export interface DeliveryRecord {
  readonly recipientId: string;
  readonly dedupeKey: string;
  readonly status: 'pending' | 'sent' | 'failed' | 'dead_lettered' | 'suppressed';
  readonly sentAt: number | null;
  readonly acknowledgedAt: number | null;
}

export interface EscalationConfig {
  /** How long a recipient has to acknowledge before the next one is brought in. */
  readonly windowMs: number;
  /** Stop after this many, rather than working through a list of twenty at 3am. */
  readonly maxSteps: number;
}

export const DEFAULT_ESCALATION: EscalationConfig = {
  windowMs: 3 * 60_000,
  maxSteps: 3,
};

export function dedupeKey(alertId: string, recipientId: string): string {
  return `${alertId}:${recipientId}`;
}

export type EscalationDecision =
  | { readonly action: 'notify'; readonly recipient: Recipient; readonly step: number }
  | { readonly action: 'wait'; readonly untilMs: number }
  | { readonly action: 'stop'; readonly reason: 'acknowledged' | 'exhausted' | 'no_recipients' };

/**
 * The next thing to do for an alert.
 *
 * Written as a pure decision so the escalation job is a loop around a testable function
 * rather than a testable-in-principle background worker.
 */
export function nextEscalationStep(input: {
  readonly recipients: readonly Recipient[];
  readonly deliveries: readonly DeliveryRecord[];
  readonly alertActivatedAt: number;
  readonly now: number;
  readonly config?: EscalationConfig;
}): EscalationDecision {
  const config = input.config ?? DEFAULT_ESCALATION;

  // Any acknowledgement, from anyone, stops the chain. The point of the chain is to reach
  // somebody, and somebody has been reached.
  if (input.deliveries.some((delivery) => delivery.acknowledgedAt !== null)) {
    return { action: 'stop', reason: 'acknowledged' };
  }

  const ordered = [...input.recipients].sort((a, b) => a.priority - b.priority);
  if (ordered.length === 0) return { action: 'stop', reason: 'no_recipients' };

  // Anybody already contacted, whatever the outcome. A dead-lettered delivery still
  // counts: retrying it is the retry loop's job, not the escalation chain's.
  const contacted = new Set(input.deliveries.map((delivery) => delivery.recipientId));

  const next = ordered.find((recipient) => !contacted.has(recipient.id));
  if (next === undefined) return { action: 'stop', reason: 'exhausted' };

  const step = contacted.size;
  if (step >= config.maxSteps) return { action: 'stop', reason: 'exhausted' };

  // The first recipient is notified immediately. Every step after waits out the window from
  // the previous send, not from the alert, so a slow first delivery does not compress
  // the time the primary recipient actually had.
  if (step === 0) return { action: 'notify', recipient: next, step: 0 };

  const lastSentAt = input.deliveries
    .map((delivery) => delivery.sentAt)
    .filter((sentAt): sentAt is number => sentAt !== null)
    .reduce((latest, sentAt) => Math.max(latest, sentAt), input.alertActivatedAt);

  const dueAt = lastSentAt + config.windowMs;
  if (input.now < dueAt) return { action: 'wait', untilMs: dueAt };

  return { action: 'notify', recipient: next, step };
}

/**
 * Whether a send should actually happen.
 *
 * Called immediately before delivery, not when the message is scheduled. That ordering is
 * the whole point: a message can sit on a queue for minutes, and the recipient may have
 * acknowledged in the meantime.
 */
export function shouldSend(input: {
  readonly dedupeKey: string;
  readonly existing: readonly DeliveryRecord[];
}): { readonly send: true } | { readonly send: false; readonly reason: string } {
  const previous = input.existing.find((record) => record.dedupeKey === input.dedupeKey);

  if (previous === undefined) return { send: true };

  if (previous.acknowledgedAt !== null) {
    return { send: false, reason: 'this recipient has already acknowledged' };
  }

  if (previous.status === 'sent' || previous.status === 'pending') {
    // The branch that makes replaying a dead-lettered message safe, and the branch that
    // makes at-least-once queue delivery invisible to the person receiving it.
    return { send: false, reason: 'already delivered or in flight for this alert' };
  }

  if (previous.status === 'suppressed') {
    return { send: false, reason: 'suppressed' };
  }

  // Failed or dead-lettered. Sending again is exactly what a deliberate replay is for.
  return { send: true };
}

/**
 * Per-recipient rate limiting.
 *
 * Separate from the general API rate limit and aimed at a different failure: a bug, or a
 * genuine burst of alerts, turning into a stream of messages to one person's phone.
 * A cap per recipient per hour bounds the worst case regardless of what caused it.
 */
export function withinRecipientLimit(
  sentTimestamps: readonly number[],
  now: number,
  limit = 10,
  windowMs = 3_600_000,
): boolean {
  return sentTimestamps.filter((timestamp) => now - timestamp < windowMs).length < limit;
}
