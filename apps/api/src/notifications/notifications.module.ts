import { Global, Module } from "@nestjs/common";
import { Notifier, LogNotifier } from "./notifier";
import { ResendNotifier } from "./resend.notifier";

// Global so any module can inject Notifier. Uses Resend when RESEND_API_KEY is set,
// otherwise logs (so flows work in dev/CI without an email provider).
@Global()
@Module({
  providers: [
    {
      provide: Notifier,
      useFactory: (): Notifier => (process.env.RESEND_API_KEY ? new ResendNotifier() : new LogNotifier()),
    },
  ],
  exports: [Notifier],
})
export class NotificationsModule {}
