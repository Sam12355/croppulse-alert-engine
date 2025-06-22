import 'reflect-metadata';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Module,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';

import {
  DEFAULT_ESCALATION,
  dedupeKey,
  nextEscalationStep,
  shouldSend,
  withinRecipientLimit,
  type Contact,
  type DeliveryRecord,
} from './escalation';
import { DEFAULT_POLICY, classify, decide, type FailureClass } from './retry';

/**
 * The runnable service.
 *
 * Thin on purpose. Every decision is in `retry.ts` and `escalation.ts`, which take no
 * dependencies, read no clock and touch no network. This file supplies the transport,
 * the storage and the provider adapters.
 *
 * The rule that shapes it: the dedupe check runs immediately before sending, not when a
 * message is scheduled. A message can sit on a queue for minutes and the recipient may
 * have acknowledged in that time.
 */

export const NOTIFICATION_STORE = Symbol('NotificationStore');
export const CHANNEL_ADAPTERS = Symbol('ChannelAdapters');
export const CLOCK = Symbol('Clock');
export const RANDOM = Symbol('Random');

export interface Clock {
  now(): number;
}

export interface Random {
  next(): number;
}

export interface OutboxMessage {
  readonly id: string;
  readonly incidentId: string;
  readonly contactId: string;
  readonly dedupeKey: string;
  readonly attempts: number;
  readonly nextAttemptAt: number | null;
  readonly deadLettered: boolean;
  readonly lastError: string | null;
}

export interface NotificationStore {
  contacts(incidentId: string): Promise<Contact[]>;
  deliveries(incidentId: string): Promise<DeliveryRecord[]>;
  recordDelivery(incidentId: string, record: DeliveryRecord): Promise<void>;
  acknowledge(incidentId: string, contactId: string, at: number): Promise<boolean>;

  enqueue(message: OutboxMessage): Promise<void>;
  claimDue(now: number, limit: number): Promise<OutboxMessage[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: string, nextAttemptAt: number | null, deadLettered: boolean): Promise<void>;
  deadLettered(): Promise<OutboxMessage[]>;

  sentTimestampsFor(contactId: string): Promise<number[]>;
}

export interface ChannelAdapter {
  readonly channel: Contact['channel'];
  /** Returns an HTTP-like status so the classifier has something to work with. */
  send(contactId: string, incidentId: string): Promise<number>;
}

// --- In-memory store -------------------------------------------------------------------

@Injectable()
export class MemoryNotificationStore implements NotificationStore {
  private readonly contactsByIncident = new Map<string, Contact[]>();
  private readonly deliveriesByIncident = new Map<string, DeliveryRecord[]>();
  private readonly outbox = new Map<string, OutboxMessage>();
  private readonly sentAt = new Map<string, number[]>();

  seedContacts(incidentId: string, contacts: Contact[]): void {
    this.contactsByIncident.set(incidentId, contacts);
  }

  async contacts(incidentId: string): Promise<Contact[]> {
    return this.contactsByIncident.get(incidentId) ?? [];
  }

  async deliveries(incidentId: string): Promise<DeliveryRecord[]> {
    return this.deliveriesByIncident.get(incidentId) ?? [];
  }

  async recordDelivery(incidentId: string, record: DeliveryRecord): Promise<void> {
    const existing = this.deliveriesByIncident.get(incidentId) ?? [];
    const without = existing.filter((entry) => entry.dedupeKey !== record.dedupeKey);
    this.deliveriesByIncident.set(incidentId, [...without, record]);

    // Only successful sends count towards the per-recipient cap. A suppressed or
    // dead-lettered attempt never reached anybody, so it should not push a later real
    // message over the limit.
    if (record.status === 'sent' && record.sentAt !== null) {
      const timestamps = this.sentAt.get(record.contactId) ?? [];
      this.sentAt.set(record.contactId, [...timestamps, record.sentAt]);
    }
  }

  async acknowledge(incidentId: string, contactId: string, at: number): Promise<boolean> {
    const existing = this.deliveriesByIncident.get(incidentId) ?? [];
    const target = existing.find((entry) => entry.contactId === contactId);
    if (target === undefined) return false;

    this.deliveriesByIncident.set(
      incidentId,
      existing.map((entry) =>
        entry.contactId === contactId ? { ...entry, acknowledgedAt: at } : entry,
      ),
    );
    return true;
  }

  async enqueue(message: OutboxMessage): Promise<void> {
    this.outbox.set(message.id, message);
  }

  async claimDue(now: number, limit: number): Promise<OutboxMessage[]> {
    return [...this.outbox.values()]
      .filter((message) => !message.deadLettered)
      .filter((message) => message.nextAttemptAt === null || message.nextAttemptAt <= now)
      .slice(0, limit);
  }

  async markPublished(id: string): Promise<void> {
    this.outbox.delete(id);
  }

  async markFailed(
    id: string,
    error: string,
    nextAttemptAt: number | null,
    deadLettered: boolean,
  ): Promise<void> {
    const message = this.outbox.get(id);
    if (message === undefined) return;

    this.outbox.set(id, {
      ...message,
      attempts: message.attempts + 1,
      lastError: error,
      nextAttemptAt,
      deadLettered,
    });
  }

  async deadLettered(): Promise<OutboxMessage[]> {
    return [...this.outbox.values()].filter((message) => message.deadLettered);
  }

  async sentTimestampsFor(contactId: string): Promise<number[]> {
    return this.sentAt.get(contactId) ?? [];
  }
}

@Injectable()
export class SystemClock implements Clock {
  now(): number { return Date.now(); }
}

@Injectable()
export class SystemRandom implements Random {
  next(): number { return Math.random(); }
}

/** Local provider. Returns a status the classifier understands, and sends nothing. */
export class MockChannelAdapter implements ChannelAdapter {
  private calls = 0;

  constructor(
    readonly channel: Contact['channel'],
    /** Statuses to return in order, then 200 for ever. Drives the retry tests. */
    private readonly script: number[] = [],
  ) {}

  get callCount(): number { return this.calls; }

  async send(): Promise<number> {
    const status = this.script[this.calls] ?? 200;
    this.calls += 1;
    return status;
  }
}

// --- Dispatcher -------------------------------------------------------------------------

@Injectable()
export class DispatchService {
  constructor(
    @Inject(NOTIFICATION_STORE) private readonly store: NotificationStore,
    @Inject(CHANNEL_ADAPTERS) private readonly adapters: ChannelAdapter[],
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RANDOM) private readonly random: Random,
  ) {}

  /** Schedules the next contact in the chain, if it is time for one. */
  async advanceEscalation(
    incidentId: string,
    activatedAt: number,
  ): Promise<{ action: string; contactId?: string; untilMs?: number }> {
    const decision = nextEscalationStep({
      contacts: await this.store.contacts(incidentId),
      deliveries: await this.store.deliveries(incidentId),
      incidentActivatedAt: activatedAt,
      now: this.clock.now(),
      config: DEFAULT_ESCALATION,
    });

    if (decision.action !== 'notify') {
      return decision.action === 'wait'
        ? { action: 'wait', untilMs: decision.untilMs }
        : { action: decision.action === 'stop' ? decision.reason : 'exhausted' };
    }

    await this.store.enqueue({
      id: `${incidentId}:${decision.contact.id}`,
      incidentId,
      contactId: decision.contact.id,
      dedupeKey: dedupeKey(incidentId, decision.contact.id),
      attempts: 0,
      nextAttemptAt: null,
      deadLettered: false,
      lastError: null,
    });

    return { action: 'notify', contactId: decision.contact.id };
  }

  /** One pass over the queue. Returns what it did so a caller can log a real number. */
  async drain(limit = 25): Promise<{ sent: number; suppressed: number; retried: number; deadLettered: number }> {
    const due = await this.store.claimDue(this.clock.now(), limit);

    let sent = 0;
    let suppressed = 0;
    let retried = 0;
    let deadLettered = 0;

    for (const message of due) {
      const outcome = await this.send(message);

      if (outcome === 'sent') sent += 1;
      else if (outcome === 'suppressed') suppressed += 1;
      else if (outcome === 'retried') retried += 1;
      else deadLettered += 1;
    }

    return { sent, suppressed, retried, deadLettered };
  }

  private async send(
    message: OutboxMessage,
  ): Promise<'sent' | 'suppressed' | 'retried' | 'dead-lettered'> {
    const existing = await this.store.deliveries(message.incidentId);

    // Checked here, immediately before sending, not when the message was scheduled. This
    // is the branch that makes a replay safe and makes at-least-once queue delivery
    // invisible to the person receiving the message.
    const permitted = shouldSend({ dedupeKey: message.dedupeKey, existing });
    if (!permitted.send) {
      await this.store.markPublished(message.id);
      return 'suppressed';
    }

    const timestamps = await this.store.sentTimestampsFor(message.contactId);
    if (!withinRecipientLimit(timestamps, this.clock.now())) {
      await this.store.markPublished(message.id);
      await this.store.recordDelivery(message.incidentId, {
        contactId: message.contactId,
        dedupeKey: message.dedupeKey,
        status: 'suppressed',
        sentAt: this.clock.now(),
        acknowledgedAt: null,
      });
      return 'suppressed';
    }

    const contacts = await this.store.contacts(message.incidentId);
    const contact = contacts.find((entry) => entry.id === message.contactId);
    const adapter = this.adapters.find((entry) => entry.channel === (contact?.channel ?? 'sms'));

    const status = adapter === undefined
      ? 503
      : await adapter.send(message.contactId, message.incidentId);

    if (status >= 200 && status < 300) {
      await this.store.markPublished(message.id);
      await this.store.recordDelivery(message.incidentId, {
        contactId: message.contactId,
        dedupeKey: message.dedupeKey,
        status: 'sent',
        sentAt: this.clock.now(),
        acknowledgedAt: null,
      });
      return 'sent';
    }

    const failure: FailureClass = classify(status);
    const decision = decide(
      DEFAULT_POLICY,
      { attempt: message.attempts + 1, failure },
      this.random.next(),
    );

    if (decision.action === 'dead-letter') {
      await this.store.markFailed(message.id, decision.reason, null, true);
      await this.store.recordDelivery(message.incidentId, {
        contactId: message.contactId,
        dedupeKey: message.dedupeKey,
        status: 'dead_lettered',
        sentAt: this.clock.now(),
        acknowledgedAt: null,
      });
      return 'dead-lettered';
    }

    await this.store.markFailed(
      message.id,
      `provider returned ${status}`,
      this.clock.now() + decision.delayMs,
      false,
    );
    return 'retried';
  }

  /**
   * Replays a dead-lettered message.
   *
   * Safe because it goes through the same dedupe check as a first attempt, and stops
   * entirely if the contact has acknowledged in the meantime.
   */
  async replay(id: string): Promise<boolean> {
    const dead = await this.store.deadLettered();
    const message = dead.find((entry) => entry.id === id);
    if (message === undefined) return false;

    await this.store.enqueue({ ...message, attempts: 0, nextAttemptAt: null, deadLettered: false });
    return true;
  }
}

// --- HTTP ------------------------------------------------------------------------------

const escalateSchema = z.object({
  incidentId: z.string().min(1),
  activatedAt: z.number().int(),
});

@Controller('api/notifications')
export class NotificationController {
  constructor(
    private readonly dispatch: DispatchService,
    @Inject(NOTIFICATION_STORE) private readonly store: NotificationStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Post('escalate')
  @HttpCode(200)
  async escalate(@Body() body: unknown) {
    const parsed = escalateSchema.parse(body);
    return this.dispatch.advanceEscalation(parsed.incidentId, parsed.activatedAt);
  }

  @Post('drain')
  @HttpCode(200)
  async drain() {
    return this.dispatch.drain();
  }

  @Get('dead-letters')
  async deadLetters() {
    const messages = await this.store.deadLettered();
    return { items: messages.map(({ id, incidentId, contactId, attempts, lastError }) => ({
      id, incidentId, contactId, attempts, lastError,
    })) };
  }

  @Post('dead-letters/:id/replay')
  @HttpCode(202)
  async replay(@Param('id') id: string) {
    const accepted = await this.dispatch.replay(id);
    if (!accepted) throw new HttpException({ error: 'not_found' }, HttpStatus.NOT_FOUND);
    return { replayed: true };
  }

  @Post('incidents/:incidentId/contacts/:contactId/acknowledge')
  @HttpCode(200)
  async acknowledge(
    @Param('incidentId') incidentId: string,
    @Param('contactId') contactId: string,
  ) {
    const acknowledged = await this.store.acknowledge(incidentId, contactId, this.clock.now());
    if (!acknowledged) throw new HttpException({ error: 'not_found' }, HttpStatus.NOT_FOUND);
    return { acknowledged: true };
  }

  @Get('incidents/:incidentId/deliveries')
  async deliveries(@Param('incidentId') incidentId: string) {
    const records = await this.store.deliveries(incidentId);
    // Identifiers and status only. No address, no number, no message body: this endpoint
    // is the one most likely to end up in a screenshot of a debugging session.
    return { items: records.map(({ contactId, status, sentAt, acknowledgedAt }) => ({
      contactId, status, sentAt, acknowledgedAt,
    })) };
  }
}

@Controller()
export class HealthController {
  @Get('health')
  health() { return { status: 'ok' }; }
}

@Module({
  controllers: [NotificationController, HealthController],
  providers: [
    DispatchService,
    { provide: NOTIFICATION_STORE, useClass: MemoryNotificationStore },
    { provide: CLOCK, useClass: SystemClock },
    { provide: RANDOM, useClass: SystemRandom },
    {
      provide: CHANNEL_ADAPTERS,
      useValue: [
        new MockChannelAdapter('sms'),
        new MockChannelAdapter('email'),
        new MockChannelAdapter('push'),
      ],
    },
  ],
})
export class AppModule {}
