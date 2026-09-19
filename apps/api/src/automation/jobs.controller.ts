import { Controller, Get, Headers, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from '../common/app-error';
import { ENV, type Env } from '../config/env';
import { type JobName, JobsService } from './jobs.service';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Avvio dei job da uno scheduler esterno (AFU cap. 14.3: EventBridge Scheduler, cron del
 * provider). Protetto da `Authorization: Bearer <JOBS_SECRET>`; senza segreto configurato
 * l'endpoint risponde 404 come se non esistesse.
 */
@Controller('internal/jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  async list(@Headers('authorization') authorization?: string) {
    this.authorize(authorization);
    return {
      jobs: this.jobs.definitions.map((d) => ({ name: d.name, description: d.description, schedule: d.schedule })),
      runs: (await this.jobs.recentRuns()).map((r) => ({
        job: r.job, status: r.status, trigger: r.trigger, startedAt: new Date(r.started_at).toISOString(),
        finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null, stats: r.stats, error: r.error,
      })),
    };
  }

  @Post(':name')
  @HttpCode(200)
  run(@Param('name') name: string, @Headers('authorization') authorization?: string) {
    this.authorize(authorization);
    if (!this.jobs.find(name)) throw new AppError('NOT_FOUND', 'Job inesistente.');
    return this.jobs.run(name as JobName, 'HTTP');
  }

  private authorize(header: string | undefined): void {
    const secret = this.env.JOBS_SECRET;
    if (!secret) throw new AppError('NOT_FOUND', 'Risorsa non trovata.');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !timingSafeEqual(digest(token), digest(secret))) throw new AppError('UNAUTHENTICATED', 'Credenziali non valide.');
  }
}
