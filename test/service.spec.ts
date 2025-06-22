import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import {
  AppModule,
  CHANNEL_ADAPTERS,
  CLOCK,
  MemoryNotificationStore,
  MockChannelAdapter,
  NOTIFICATION_STORE,
  RANDOM,
} from '../src/app.module';
import { DEFAULT_ESCALATION } from '../src/escalation';

/**
 * The reliability rules, over real HTTP, against the running service.
 *
 * The unit tests prove the decisions are right. These prove they are actually wired to the
 * transport and the store, which is the claim that has historically been wrong: a dedupe
 * rule that is correct in a pure function and never called from the worker prevents
 * nothing.
 *
 * Time and randomness are still injected, so nothing waits.
 */

class ControllableClock {
  constructor(private current = 1_773_000_000_000) {}
  now(): number { return this.current; }
  advance(ms: number): void { this.current += ms; }
}

let app: INestApplication;
let http: App;
let clock: ControllableClock;
let store: MemoryNotificationStore;
let sms: MockChannelAdapter;

const INCIDENT = 'incident-1';
const ACTIVATED_AT = 1_773_000_000_000;

async function boot(smsScript: number[] = []) {
  clock = new ControllableClock(ACTIVATED_AT);
  store = new MemoryNotificationStore();
  sms = new MockChannelAdapter('sms', smsScript);

  store.seedContacts(INCIDENT, [
    { id: 'primary', priority: 1, channel: 'sms' },
    { id: 'secondary', priority: 2, channel: 'sms' },
    { id: 'tertiary', priority: 3, channel: 'sms' },
  ]);

  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK).useValue(clock)
    .overrideProvider(NOTIFICATION_STORE).useValue(store)
    .overrideProvider(CHANNEL_ADAPTERS).useValue([sms])
    // Fixed, so the backoff schedule is deterministic rather than sampled.
    .overrideProvider(RANDOM).useValue({ next: () => 0.5 })
    .compile();

  app = module.createNestApplication();
  await app.init();
  http = app.getHttpServer();
}

const escalate = () =>
  request(http).post('/api/notifications/escalate').send({ incidentId: INCIDENT, activatedAt: ACTIVATED_AT });

const drain = () => request(http).post('/api/notifications/drain');

afterEach(async () => {
  await app.close();
});

describe('the service runs', () => {
  it('answers a health check', async () => {
    await boot();
    const response = await request(http).get('/health').expect(200);
    expect(response.body.status).toBe('ok');
  });
});

describe('escalation over HTTP', () => {
  it('notifies the primary contact immediately', async () => {
    await boot();

    const response = await escalate().expect(200);
    expect(response.body).toEqual({ action: 'notify', contactId: 'primary' });

    const drained = await drain().expect(200);
    expect(drained.body.sent).toBe(1);
  });

  it('waits out the window before bringing in the secondary', async () => {
    await boot();
    await escalate();
    await drain();

    clock.advance(60_000);
    const response = await escalate().expect(200);

    expect(response.body.action).toBe('wait');
  });

  it('escalates once the window has elapsed with no acknowledgement', async () => {
    await boot();
    await escalate();
    await drain();

    clock.advance(DEFAULT_ESCALATION.windowMs + 1);
    const response = await escalate().expect(200);

    expect(response.body).toEqual({ action: 'notify', contactId: 'secondary' });
  });

  it('stops the chain the moment somebody acknowledges', async () => {
    await boot();
    await escalate();
    await drain();

    await request(http)
      .post(`/api/notifications/incidents/${INCIDENT}/contacts/primary/acknowledge`)
      .expect(200);

    clock.advance(DEFAULT_ESCALATION.windowMs * 10);
    const response = await escalate().expect(200);

    // The tertiary contact is never woken up.
    expect(response.body.action).toBe('acknowledged');
  });

  it('runs a whole chain and never notifies the same person twice', async () => {
    await boot();
    const notified: string[] = [];

    for (let step = 0; step < 6; step += 1) {
      const response = await escalate().expect(200);

      if (response.body.action === 'notify') {
        notified.push(response.body.contactId);
        await drain();
      } else if (response.body.action === 'wait') {
        clock.advance(DEFAULT_ESCALATION.windowMs + 1);
      } else {
        break;
      }
    }

    expect(notified).toEqual(['primary', 'secondary', 'tertiary']);
    expect(new Set(notified).size).toBe(notified.length);
  });
});

describe('deduplication over HTTP', () => {
  it('draining repeatedly sends one message, not one per drain', async () => {
    await boot();
    await escalate();

    const first = await drain().expect(200);
    expect(first.body.sent).toBe(1);

    // At-least-once queue delivery, and a scheduler that overlaps with itself. Neither
    // should be visible to the person receiving the message.
    for (let i = 0; i < 4; i += 1) await drain().expect(200);

    expect(sms.callCount).toBe(1);
  });

  it('does not send again after an acknowledgement, even on a replay', async () => {
    await boot([500, 500, 500, 500, 500]);
    await escalate();

    // Burn the retry budget so the message dead-letters.
    for (let i = 0; i < 6; i += 1) {
      await drain();
      clock.advance(600_000);
    }

    const deadLetters = await request(http).get('/api/notifications/dead-letters').expect(200);
    expect(deadLetters.body.items.length).toBe(1);

    await request(http)
      .post(`/api/notifications/incidents/${INCIDENT}/contacts/primary/acknowledge`)
      .expect(200);

    await request(http)
      .post(`/api/notifications/dead-letters/${deadLetters.body.items[0].id}/replay`)
      .expect(202);

    const callsBefore = sms.callCount;
    const drained = await drain().expect(200);

    // Messaging somebody who has already answered is worse than not messaging them.
    expect(drained.body.suppressed).toBe(1);
    expect(sms.callCount).toBe(callsBefore);
  });
});

describe('retries and dead-lettering over HTTP', () => {
  it('retries a transient failure rather than giving up', async () => {
    await boot([503, 503, 200]);
    await escalate();

    const first = await drain().expect(200);
    expect(first.body.retried).toBe(1);

    clock.advance(600_000);
    await drain();

    clock.advance(600_000);
    const third = await drain().expect(200);
    expect(third.body.sent).toBe(1);
  });

  it('dead-letters a permanent failure immediately, without burning the budget', async () => {
    await boot([400]);
    await escalate();

    const drained = await drain().expect(200);

    // Five attempts at an address that does not exist delays the point at which somebody
    // notices the details are wrong.
    expect(drained.body.deadLettered).toBe(1);
    expect(sms.callCount).toBe(1);
  });

  it('exposes dead letters with their failure reason', async () => {
    await boot([400]);
    await escalate();
    await drain();

    const response = await request(http).get('/api/notifications/dead-letters').expect(200);
    expect(response.body.items[0].contactId).toBe('primary');
    expect(response.body.items[0].lastError).toBeTruthy();
  });

  it('replays a dead-lettered message safely', async () => {
    await boot([503, 503, 503, 503, 503, 200]);
    await escalate();

    for (let i = 0; i < 6; i += 1) {
      await drain();
      clock.advance(600_000);
    }

    const deadLetters = await request(http).get('/api/notifications/dead-letters').expect(200);
    expect(deadLetters.body.items.length).toBe(1);

    await request(http)
      .post(`/api/notifications/dead-letters/${deadLetters.body.items[0].id}/replay`)
      .expect(202);

    const drained = await drain().expect(200);
    expect(drained.body.sent).toBe(1);
  });

  it('returns 404 replaying something that is not dead-lettered', async () => {
    await boot();
    await request(http).post('/api/notifications/dead-letters/nope/replay').expect(404);
  });
});

describe('what the delivery endpoint exposes', () => {
  it('returns identifiers and status, never contact details', async () => {
    await boot();
    await escalate();
    await drain();

    const response = await request(http)
      .get(`/api/notifications/incidents/${INCIDENT}/deliveries`)
      .expect(200);

    expect(response.body.items[0]).toEqual({
      contactId: 'primary',
      status: 'sent',
      sentAt: expect.any(Number),
      acknowledgedAt: null,
    });

    // This endpoint is the one most likely to end up in a screenshot of a debugging
    // session, so there is structurally nothing sensitive in it.
    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toMatch(/@/);
    expect(serialised).not.toMatch(/\+\d/);
  });
});
