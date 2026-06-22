import { Module } from "@nestjs/common";
import { ServeController } from "./serve.controller";
import { ServeService } from "./serve.service";

// RankingService comes from the global RankingModule.
@Module({ controllers: [ServeController], providers: [ServeService] })
export class ServeModule {}
