import { Injectable, Logger } from "@nestjs/common";

/**
 * Transactional notification seam. The default `LogNotifier` just logs the message
 * (so flows work end-to-end without an email provider). In production, bind this token
 * to a real provider (SES/SendGrid/Resend) — one class, no call-site changes.
 */
export abstract class Notifier {
  abstract send(to: string, subject: string, body: string): Promise<void>;
}

@Injectable()
export class LogNotifier extends Notifier {
  private readonly logger = new Logger("Notifier");
  async send(to: string, subject: string, body: string): Promise<void> {
    // No provider configured — log so the link/code is visible in dev.
    this.logger.log(`[email] to=${to} subject=${JSON.stringify(subject)} body=${JSON.stringify(body)}`);
  }
}
