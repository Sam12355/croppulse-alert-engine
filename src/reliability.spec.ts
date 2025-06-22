

import {
  DEFAULT_ESCALATION,
  dedupeKey,
  nextEscalationStep,
  shouldSend,
  withinRecipientLimit,
  type Contact,
  type DeliveryRecord,
} from './escalation';
import { DEFAULT_POLICY, backoffMs, classify, decide } from './retry';

const NOW = 1_773_000_000_000;

const contacts: Contact[] = [
  { id: 'primary', priority: 1, channel: 'sms' },
  { id: 'secondary', priority: 2, channel: 'sms' },
  { id: 'tertiary', priority: 3, channel: 'email' },
];

function delivery(overrides: Partial<DeliveryRecord> & { contactId: string }): DeliveryRecord {
  return {
    dedupeKey: dedupeKey('incident-1', overrides.contactId),
    status: 'sent',
    sentAt: NOW,
    acknowledgedAt: null,
    ...overrides,
  };
}

describe('backoff', () => {
  it('grows exponentially without jitter', () => {
    const policy = { ...DEFAULT_POLICY, strategy: 'none' as const };
    expect(backoffMs(policy, 1, 0.5)).toBe(2_000);
    expect(backoffMs(policy, 2, 0.5)).toBe(4_000);
    expect(backoffMs(policy, 3, 0.5)).toBe(8_000);
    expect(backoffMs(policy, 4, 0.5)).toBe(16_000);
  });

  it('caps at the ceiling', () => {
    const policy = { ...DEFAULT_POLICY, strategy: 'none' as const };
    // Past ten minutes a message is not going to be delivered by waiting longer.
    expect(backoffMs(policy, 30, 0.5)).toBe(policy.maxDelayMs);
  });

  it('spreads full jitter across the whole window', () => {
    // The reason jitter exists: without it, every message that failed during one outage
    // retries at the same instant and the recovering provider gets the whole backlog.
    expect(backoffMs(DEFAULT_POLICY, 3, 0)).toBe(0);
    expect(backoffMs(DEFAULT_POLICY, 3, 0.5)).toBe(4_000);
    expect(backoffMs(DEFAULT_POLICY, 3, 0.999)).toBe(7_992);
  });

  it('keeps a guaranteed minimum gap with equal jitter', () => {
    const policy = { ...DEFAULT_POLICY, strategy: 'equal-jitter' as const };
    expect(backoffMs(policy, 3, 0)).toBe(4_000);
    expect(backoffMs(policy, 3, 1)).toBe(8_000);
  });

  it('is zero before the first retry', () => {
    expect(backoffMs(DEFAULT_POLICY, 0, 0.5)).toBe(0);
  });
});

describe('classifying a provider response', () => {
  it.each([
    [500, 'transient'],
    [502, 'transient'],
    [503, 'transient'],
    [408, 'transient'],
    [425, 'transient'],
    [429, 'throttled'],
    [400, 'permanent'],
    [401, 'permanent'],
    [404, 'permanent'],
    [422, 'permanent'],
  ])('classifies %i as %s', (status, expected) => {
    expect(classify(status)).toBe(expected);
  });
});

describe('retry decisions', () => {
  it('retries a transient failure', () => {
    const decision = decide(DEFAULT_POLICY, { attempt: 1, failure: 'transient' }, 0.5);
    expect(decision.action).toBe('retry');
    if (decision.action !== 'retry') return;
    expect(decision.attempt).toBe(2);
  });

  it('never retries a permanent failure', () => {
    // Five attempts at an address that does not exist wastes the budget and delays the
    // point at which somebody notices the contact details are wrong.
    const decision = decide(DEFAULT_POLICY, { attempt: 1, failure: 'permanent' }, 0.5);
    expect(decision.action).toBe('dead-letter');
  });

  it('dead-letters once the attempt budget is exhausted', () => {
    const decision = decide(
      DEFAULT_POLICY,
      { attempt: DEFAULT_POLICY.maxAttempts, failure: 'transient' },
      0.5,
    );
    expect(decision.action).toBe('dead-letter');
    if (decision.action !== 'dead-letter') return;
    expect(decision.reason).toContain('exhausted');
  });

  it('honours a Retry-After from a throttling provider', () => {
    const decision = decide(
      DEFAULT_POLICY,
      { attempt: 1, failure: 'throttled', retryAfterMs: 45_000 },
      0.5,
    );
    expect(decision.action).toBe('retry');
    if (decision.action !== 'retry') return;
    // The provider knows better than our curve does.
    expect(decision.delayMs).toBe(45_000);
  });

  it('never waits longer than the ceiling even if a provider asks for it', () => {
    const decision = decide(
      DEFAULT_POLICY,
      { attempt: 1, failure: 'throttled', retryAfterMs: 86_400_000 },
      0.5,
    );
    expect(decision.action).toBe('retry');
    if (decision.action !== 'retry') return;
    expect(decision.delayMs).toBe(DEFAULT_POLICY.maxDelayMs);
  });

  it('falls back to backoff when a throttling provider gives no hint', () => {
    const decision = decide(DEFAULT_POLICY, { attempt: 2, failure: 'throttled' }, 1);
    expect(decision.action).toBe('retry');
    if (decision.action !== 'retry') return;
    expect(decision.delayMs).toBeGreaterThan(0);
  });

  it('walks a whole failing message to the dead-letter queue in the expected number of steps', () => {
    let attempt = 1;
    let deadLettered = false;

    for (let i = 0; i < 20 && !deadLettered; i += 1) {
      const decision = decide(DEFAULT_POLICY, { attempt, failure: 'transient' }, 0.5);
      if (decision.action === 'dead-letter') deadLettered = true;
      else attempt = decision.attempt;
    }

    expect(deadLettered).toBe(true);
    expect(attempt).toBe(DEFAULT_POLICY.maxAttempts);
  });
});

describe('deduplication', () => {
  it('sends when this contact has not been contacted for this incident', () => {
    expect(shouldSend({ dedupeKey: dedupeKey('incident-1', 'primary'), existing: [] }).send).toBe(
      true,
    );
  });

  it('does not send twice for the same incident and contact', () => {
    const result = shouldSend({
      dedupeKey: dedupeKey('incident-1', 'primary'),
      existing: [delivery({ contactId: 'primary', status: 'sent' })],
    });

    // The branch that makes at-least-once queue delivery invisible to the person
    // receiving the message.
    expect(result.send).toBe(false);
  });

  it('does not send while an earlier attempt is still in flight', () => {
    const result = shouldSend({
      dedupeKey: dedupeKey('incident-1', 'primary'),
      existing: [delivery({ contactId: 'primary', status: 'pending' })],
    });
    expect(result.send).toBe(false);
  });

  it('allows a deliberate replay of a dead-lettered delivery', () => {
    const result = shouldSend({
      dedupeKey: dedupeKey('incident-1', 'primary'),
      existing: [delivery({ contactId: 'primary', status: 'dead_lettered' })],
    });
    expect(result.send).toBe(true);
  });

  it('does not send to someone who has already acknowledged', () => {
    const result = shouldSend({
      dedupeKey: dedupeKey('incident-1', 'primary'),
      existing: [
        delivery({ contactId: 'primary', status: 'dead_lettered', acknowledgedAt: NOW }),
      ],
    });

    // Even a manual replay stops here. Messaging someone who already answered is worse
    // than not messaging them at all.
    expect(result.send).toBe(false);
  });

  it('scopes the key to one incident, so a second incident does notify the same person', () => {
    const result = shouldSend({
      dedupeKey: dedupeKey('incident-2', 'primary'),
      existing: [delivery({ contactId: 'primary', status: 'sent' })],
    });
    expect(result.send).toBe(true);
  });

  it('replaying the same message twice produces one user-visible notification', () => {
    const existing: DeliveryRecord[] = [];
    const key = dedupeKey('incident-1', 'primary');

    let sent = 0;
    for (let replay = 0; replay < 5; replay += 1) {
      if (shouldSend({ dedupeKey: key, existing }).send) {
        sent += 1;
        existing.push(delivery({ contactId: 'primary', status: 'sent' }));
      }
    }

    expect(sent).toBe(1);
  });
});

describe('escalation', () => {
  it('notifies the primary contact immediately', () => {
    const decision = nextEscalationStep({
      contacts,
      deliveries: [],
      incidentActivatedAt: NOW,
      now: NOW,
    });

    expect(decision.action).toBe('notify');
    if (decision.action !== 'notify') return;
    expect(decision.contact.id).toBe('primary');
    expect(decision.step).toBe(0);
  });

  it('waits out the window before bringing in the secondary', () => {
    const decision = nextEscalationStep({
      contacts,
      deliveries: [delivery({ contactId: 'primary' })],
      incidentActivatedAt: NOW,
      now: NOW + 60_000,
    });

    expect(decision.action).toBe('wait');
    if (decision.action !== 'wait') return;
    expect(decision.untilMs).toBe(NOW + DEFAULT_ESCALATION.windowMs);
  });

  it('escalates once the window has elapsed with no acknowledgement', () => {
    const decision = nextEscalationStep({
      contacts,
      deliveries: [delivery({ contactId: 'primary' })],
      incidentActivatedAt: NOW,
      now: NOW + DEFAULT_ESCALATION.windowMs + 1,
    });

    expect(decision.action).toBe('notify');
    if (decision.action !== 'notify') return;
    expect(decision.contact.id).toBe('secondary');
  });

  it('measures the window from the last send, not from the incident', () => {
    // A slow first delivery must not eat the time the primary contact actually had.
    const lateSend = NOW + 120_000;
    const decision = nextEscalationStep({
      contacts,
      deliveries: [delivery({ contactId: 'primary', sentAt: lateSend })],
      incidentActivatedAt: NOW,
      now: lateSend + 60_000,
    });

    expect(decision.action).toBe('wait');
    if (decision.action !== 'wait') return;
    expect(decision.untilMs).toBe(lateSend + DEFAULT_ESCALATION.windowMs);
  });

  it('stops the moment anyone acknowledges', () => {
    const decision = nextEscalationStep({
      contacts,
      deliveries: [delivery({ contactId: 'primary', acknowledgedAt: NOW + 30_000 })],
      incidentActivatedAt: NOW,
      now: NOW + 600_000,
    });

    expect(decision.action).toBe('stop');
    if (decision.action !== 'stop') return;
    expect(decision.reason).toBe('acknowledged');
  });

  it('stops even when the acknowledgement came from a later contact', () => {
    const decision = nextEscalationStep({
      contacts,
      deliveries: [
        delivery({ contactId: 'primary' }),
        delivery({ contactId: 'secondary', acknowledgedAt: NOW + 300_000 }),
      ],
      incidentActivatedAt: NOW,
      now: NOW + 900_000,
    });

    expect(decision.action).toBe('stop');
  });

  it('stops at the step limit rather than working through a list of twenty at 3am', () => {
    const many: Contact[] = Array.from({ length: 10 }, (_unused, index) => ({
      id: `contact-${index}`,
      priority: index + 1,
      channel: 'sms' as const,
    }));

    const decision = nextEscalationStep({
      contacts: many,
      deliveries: many
        .slice(0, DEFAULT_ESCALATION.maxSteps)
        .map((contact) => delivery({ contactId: contact.id })),
      incidentActivatedAt: NOW,
      now: NOW + 3_600_000,
    });

    expect(decision.action).toBe('stop');
    if (decision.action !== 'stop') return;
    expect(decision.reason).toBe('exhausted');
  });

  it('stops when there is nobody left to escalate to', () => {
    const decision = nextEscalationStep({
      contacts: [contacts[0] as Contact],
      deliveries: [delivery({ contactId: 'primary' })],
      incidentActivatedAt: NOW,
      now: NOW + 3_600_000,
    });

    expect(decision.action).toBe('stop');
    if (decision.action !== 'stop') return;
    expect(decision.reason).toBe('exhausted');
  });

  it('stops when the account has no contacts at all', () => {
    const decision = nextEscalationStep({
      contacts: [],
      deliveries: [],
      incidentActivatedAt: NOW,
      now: NOW,
    });

    expect(decision.action).toBe('stop');
    if (decision.action !== 'stop') return;
    expect(decision.reason).toBe('no_contacts');
  });

  it('counts a dead-lettered delivery as contacted, so the chain moves on', () => {
    // Retrying that delivery is the retry loop's job. The chain's job is to reach
    // somebody else, and it should not stall waiting for a message that will not arrive.
    const decision = nextEscalationStep({
      contacts,
      deliveries: [delivery({ contactId: 'primary', status: 'dead_lettered' })],
      incidentActivatedAt: NOW,
      now: NOW + DEFAULT_ESCALATION.windowMs + 1,
    });

    expect(decision.action).toBe('notify');
    if (decision.action !== 'notify') return;
    expect(decision.contact.id).toBe('secondary');
  });

  it('respects priority order rather than list order', () => {
    const decision = nextEscalationStep({
      contacts: [
        { id: 'third', priority: 3, channel: 'sms' },
        { id: 'first', priority: 1, channel: 'sms' },
        { id: 'second', priority: 2, channel: 'sms' },
      ],
      deliveries: [],
      incidentActivatedAt: NOW,
      now: NOW,
    });

    expect(decision.action).toBe('notify');
    if (decision.action !== 'notify') return;
    expect(decision.contact.id).toBe('first');
  });

  it('runs a whole chain: primary silent, secondary acknowledges', () => {
    let deliveries: DeliveryRecord[] = [];
    let now = NOW;

    const first = nextEscalationStep({ contacts, deliveries, incidentActivatedAt: NOW, now });
    expect(first.action).toBe('notify');
    deliveries = [...deliveries, delivery({ contactId: 'primary', sentAt: now })];

    now += DEFAULT_ESCALATION.windowMs + 1;
    const second = nextEscalationStep({ contacts, deliveries, incidentActivatedAt: NOW, now });
    expect(second.action).toBe('notify');
    if (second.action !== 'notify') return;
    expect(second.contact.id).toBe('secondary');
    deliveries = [...deliveries, delivery({ contactId: 'secondary', sentAt: now })];

    // The secondary answers.
    deliveries = deliveries.map((record) =>
      record.contactId === 'secondary' ? { ...record, acknowledgedAt: now + 30_000 } : record,
    );

    now += DEFAULT_ESCALATION.windowMs + 1;
    const third = nextEscalationStep({ contacts, deliveries, incidentActivatedAt: NOW, now });

    // The tertiary contact is never woken up.
    expect(third.action).toBe('stop');
    if (third.action !== 'stop') return;
    expect(third.reason).toBe('acknowledged');
  });
});

describe('per-recipient rate limiting', () => {
  it('allows sends below the cap', () => {
    expect(withinRecipientLimit([NOW - 1_000, NOW - 2_000], NOW, 10)).toBe(true);
  });

  it('blocks once the cap is reached inside the window', () => {
    // Bounds the worst case of a bug, or a genuine burst, turning into a stream of
    // messages to one person's phone.
    const timestamps = Array.from({ length: 10 }, (_unused, i) => NOW - i * 1_000);
    expect(withinRecipientLimit(timestamps, NOW, 10)).toBe(false);
  });

  it('ignores sends that have aged out of the window', () => {
    const old = Array.from({ length: 20 }, (_unused, i) => NOW - 7_200_000 - i * 1_000);
    expect(withinRecipientLimit(old, NOW, 10)).toBe(true);
  });
});
