import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";

// PrismaService + RankingService come from their global modules.
@Module({ controllers: [AdminController] })
export class AdminModule {}
