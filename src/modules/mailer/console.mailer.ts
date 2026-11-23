import { Injectable, Logger } from '@nestjs/common';
import { type MailMessage, type Mailer } from './mailer.interface';

/** Development adapter: writes emails to the structured log instead of sending them. */
@Injectable()
export class ConsoleMailer implements Mailer {
  private readonly logger = new Logger('Mailer');

  constructor(private readonly from: string) {}

  send(message: MailMessage): Promise<void> {
    this.logger.log(
      { mail: { from: this.from, ...message } },
      `email to ${message.to}: ${message.subject}`,
    );
    return Promise.resolve();
  }
}
