import { Module } from "@nestjs/common";
import { ServeController } from "./serve.controller";
import { ServeService } from "./serve.service";
import { PacingService } from "./pacing.service";
import { LedgerModule } from "../ledger/ledger.module";
import { KillswitchModule } from "../config/killswitch.module";

// RankingService comes from the global RankingModule; LedgerService from LedgerModule.
@Module({ imports: [LedgerModule, KillswitchModule], controllers: [ServeController], providers: [ServeService, PacingService] })
export class ServeModule {}
