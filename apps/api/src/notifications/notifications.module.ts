import { Global, Module } from "@nestjs/common";
import { Notifier, LogNotifier } from "./notifier";

// Global so any module can inject Notifier. Swap LogNotifier for a real provider in prod.
@Global()
@Module({
  providers: [{ provide: Notifier, useClass: LogNotifier }],
  exports: [Notifier],
})
export class NotificationsModule {}
