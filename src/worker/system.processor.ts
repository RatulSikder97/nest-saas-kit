import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type Job, Queue } from 'bullmq';
import { AppConfig } from '../config/app-config.service';
import { OutboxRelayService } from '../modules/outbox/outbox-relay.service';
import { SYSTEM_QUEUE } from '../modules/outbox/outbox.service';
import { UsageService } from '../modules/usage/usage.service';

export const SystemJobs = {
  OutboxRelay: 'outbox.relay',
  UsageFlush: 'usage.flush',
} as const;

/**
 * Periodic maintenance jobs, scheduled via BullMQ job schedulers so that exactly one instance
 * of each tick runs no matter how many worker replicas are up.
 */
@Processor(SYSTEM_QUEUE, { concurrency: 1 })
export class SystemProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(SystemProcessor.name);

  constructor(
    @InjectQueue(SYSTEM_QUEUE) private readonly queue: Queue,
    private readonly outboxRelay: OutboxRelayService,
    private readonly usage: UsageService,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    const jobOpts = { removeOnComplete: true, removeOnFail: 100 };
    await this.queue.upsertJobScheduler(
      SystemJobs.OutboxRelay,
      { every: this.config.get('OUTBOX_POLL_INTERVAL_MS') },
      { name: SystemJobs.OutboxRelay, opts: jobOpts },
    );
    await this.queue.upsertJobScheduler(
      SystemJobs.UsageFlush,
      { every: this.config.get('USAGE_FLUSH_INTERVAL_MS') },
      { name: SystemJobs.UsageFlush, opts: jobOpts },
    );
    this.logger.log('job schedulers registered');
  }

  async process(job: Job): Promise<number> {
    switch (job.name) {
      case SystemJobs.OutboxRelay: {
        let total = 0;
        // Drain in batches so a backlog clears within one tick.
        for (
          let relayed = await this.outboxRelay.relayBatch();
          relayed > 0;
          relayed = await this.outboxRelay.relayBatch()
        ) {
          total += relayed;
        }
        return total;
      }
      case SystemJobs.UsageFlush:
        return this.usage.flush();
      default:
        throw new Error(`Unknown system job ${job.name}`);
    }
  }
}
