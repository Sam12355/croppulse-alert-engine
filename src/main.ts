import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

/**
 * The service entry point.
 *
 * In-memory adapters by default, so `pnpm dev` needs nothing installed. Setting
 * DATABASE_URL, REDIS_URL and SQS_QUEUE_URL swaps the bindings; nothing above the port
 * changes.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3003);
  await app.listen(port);

  process.stdout.write(`notification engine listening on ${port}\n`);
  process.stdout.write('portfolio demonstration: no message reaches a real recipient\n');
}

void bootstrap();
