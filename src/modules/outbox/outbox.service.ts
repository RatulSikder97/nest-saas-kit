import { Injectable } from '@nestjs/common';
import { TenancyService } from '../../tenancy/tenancy.service';
import { OutboxEvent, type OutboxPayload } from './outbox-event.entity';

export const DOMAIN_EVENTS_QUEUE = 'domain-events';
export const SYSTEM_QUEUE = 'system';

export const DomainEvents = {
  InvitationCreated: 'invitation.created',
} as const;

export interface InvitationCreatedPayload extends OutboxPayload {
  invitationId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: string;
  acceptUrl: string;
  expiresAt: string;
}

@Injectable()
export class OutboxService {
  constructor(private readonly tenancy: TenancyService) {}

  /** Stages an event in the active tenant transaction; it is published only if that commits. */
  async enqueue(type: string, payload: OutboxPayload): Promise<OutboxEvent> {
    const manager = this.tenancy.manager();
    const event = manager.create(OutboxEvent, {
      type,
      payload,
      organizationId: this.tenancy.organizationId(),
    });
    return manager.save(event);
  }
}
