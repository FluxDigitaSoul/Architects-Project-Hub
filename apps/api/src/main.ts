import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';
import { ENV, type Env } from './config/env';

async function main(): Promise<void> {
  const app = await createApp();
  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`API in ascolto su http://localhost:${env.PORT}/api/v1`);
}

main().catch((error: unknown) => {
  new Logger('Bootstrap').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
