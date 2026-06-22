import { Global, Module } from "@nestjs/common";
import { RankingService } from "./ranking.service";

@Global()
@Module({ providers: [RankingService], exports: [RankingService] })
export class RankingModule {}
