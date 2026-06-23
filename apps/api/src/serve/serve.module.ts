import { Module } from "@nestjs/common";
import { ServeController } from "./serve.controller";
import { ServeService } from "./serve.service";
import { PacingService } from "./pacing.service";
import { LedgerModule } from "../ledger/ledger.module";

// RankingService comes from the global RankingModule; LedgerService from LedgerModule.
@Module({ imports: [LedgerModule], controllers: [ServeController], providers: [ServeService, PacingService] })
export class ServeModule {}
