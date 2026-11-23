import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { type Job } from 'bullmq';
import { MAILER, type Mailer } from '../mailer/mailer.interface';
import { type DomainEventJob } from './outbox-relay.service';
import { DOMAIN_EVENTS_QUEUE, DomainEvents, type InvitationCreatedPayload } from './outbox.service';

/** Consumes domain events. Failures throw so BullMQ retries with exponential backoff. */
@Processor(DOMAIN_EVENTS_QUEUE, { concurrency: 10 })
export class DomainEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(DomainEventsProcessor.name);

  constructor(@Inject(MAILER) private readonly mailer: Mailer) {
    super();
  }

  async process(job: Job<DomainEventJob>): Promise<void> {
    switch (job.name) {
      case DomainEvents.InvitationCreated:
        return this.sendInvitation(job.data.payload as InvitationCreatedPayload);
      default:
        this.logger.warn(`no handler for domain event ${job.name} (${job.data.eventId}); skipping`);
    }
  }

  private async sendInvitation(payload: InvitationCreatedPayload): Promise<void> {
    await this.mailer.send({
      to: payload.email,
      subject: `You have been invited to join ${payload.organizationName}`,
      text: [
        `You have been invited to join ${payload.organizationName} as ${payload.role}.`,
        `Accept the invitation: ${payload.acceptUrl}`,
        `This link expires at ${payload.expiresAt}.`,
      ].join('\n\n'),
    });
  }
}
