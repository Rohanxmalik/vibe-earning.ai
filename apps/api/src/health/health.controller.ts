import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: is the process up? Cheap, no dependencies — for restart decisions. */
  @Get()
  check() {
    return { status: "ok" };
  }

  /** Readiness: can we actually serve? Pings Postgres + Redis; 503 if either is down,
   *  so a load balancer stops routing to a pod with a dead dependency. */
  @Get("ready")
  async ready() {
    const [db, redis] = await Promise.allSettled([
      this.prisma.$queryRawUnsafe("SELECT 1"),
      this.redis.ping(),
    ]);
    const dbUp = db.status === "fulfilled";
    const redisUp = redis.status === "fulfilled";
    if (!dbUp || !redisUp) {
      throw new ServiceUnavailableException({ status: "unavailable", db: dbUp ? "up" : "down", redis: redisUp ? "up" : "down" });
    }
    return { status: "ready", db: "up", redis: "up" };
  }
}
