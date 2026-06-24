import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { MetricsService } from "./metrics.service";

/** Records every HTTP request's method/status/duration into the metrics registry. */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const start = process.hrtime.bigint();
    const http = context.switchToHttp();
    const req = http.getRequest<{ method?: string }>();
    const record = () => {
      const res = http.getResponse<{ statusCode?: number }>();
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.recordRequest(req.method ?? "UNKNOWN", res.statusCode ?? 0, seconds);
    };
    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
