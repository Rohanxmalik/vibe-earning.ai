import { Injectable } from "@nestjs/common";
import { Notifier } from "./notifier";

type HttpFn = typeof fetch;

/**
 * Real email delivery via Resend's HTTP API (no SDK dependency). Bound as the Notifier
 * when RESEND_API_KEY is set; otherwise the LogNotifier is used. Swapping to SES/SendGrid
 * is the same shape — only this file changes.
 */
@Injectable()
export class ResendNotifier extends Notifier {
  private http: HttpFn = fetch;
  /** Test seam — inject a fake fetch. */
  setHttp(fn: HttpFn): void { this.http = fn; }

  private key(): string {
    const k = process.env.RESEND_API_KEY;
    if (!k) throw new Error("resend_not_configured");
    return k;
  }
  private from(): string {
    return process.env.EMAIL_FROM ?? "Kickbacks <noreply@kickbacks.in>";
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    const res = await this.http("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.key()}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from(), to, subject, text: body }),
    });
    if (!res.ok) throw new Error(`email_send_failed_${res.status}`);
  }
}
