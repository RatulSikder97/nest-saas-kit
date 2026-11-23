export const MAILER = Symbol('MAILER');

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Port for outbound email. Swap the adapter (SES, Postmark, SMTP...) without touching callers. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
