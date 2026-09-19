import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { JobsService } from './jobs.service';

const TICK_MS = 60_000;

/**
 * Esegue i job dentro l'API (AFU cap. 14.3) quando `JOBS_SCHEDULER=on` (predefinito, tranne nei
 * test). Ogni minuto controlla quali job sono dovuti; il lease in `job_runs` rende sicuro avere più
 * istanze. In produzione si può spegnere e usare uno scheduler esterno con `POST /internal/jobs/:name`.
 */
@Injectable()
export class JobsScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Scheduler');
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly jobs: JobsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get enabled(): boolean {
    return (this.env.JOBS_SCHEDULER ?? (this.env.NODE_ENV === 'test' ? 'off' : 'on')) === 'on';
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    this.logger.log(`Job pianificati attivi: ${this.jobs.definitions.map((d) => d.name).join(', ')}`);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Un giro: i job dovuti partono uno dopo l'altro; un giro non si sovrappone al precedente. */
  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const def of this.jobs.definitions) {
        if (!(await this.jobs.isDue(def, now))) continue;
        const result = await this.jobs.run(def.name, 'SCHEDULER', now);
        if (result.status === 'DONE' && Object.values(result.stats).some((v) => v > 0)) {
          this.logger.log(`${def.name}: ${JSON.stringify(result.stats)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Giro dello scheduler non riuscito: ${(error as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }
}
