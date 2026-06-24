import { Injectable } from "@nestjs/common";

const BUCKETS = [0.01, 0.05, 0.1, 0.5, 1, 2, 5];

/**
 * Tiny in-process Prometheus registry (no dependency). Tracks request counts by
 * method/status and a cumulative request-duration histogram. Exposed at /metrics for
 * a Prometheus/Grafana scrape. Counters are per-process — fine since each pod is
 * scraped independently.
 */
@Injectable()
export class MetricsService {
  private readonly requests = new Map<string, number>(); // `${method}|${status}` -> count
  private readonly bucketCounts = new Array(BUCKETS.length + 1).fill(0); // last = +Inf
  private durationSum = 0;
  private durationCount = 0;

  recordRequest(method: string, status: number, seconds: number): void {
    const key = `${method}|${status}`;
    this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
    this.durationSum += seconds;
    this.durationCount += 1;
    for (let i = 0; i < BUCKETS.length; i++) {
      if (seconds <= BUCKETS[i]) this.bucketCounts[i] += 1;
    }
    this.bucketCounts[BUCKETS.length] += 1; // +Inf
  }

  render(): string {
    const lines: string[] = [];
    lines.push("# HELP http_requests_total Total HTTP requests.");
    lines.push("# TYPE http_requests_total counter");
    for (const [key, count] of this.requests) {
      const [method, status] = key.split("|");
      lines.push(`http_requests_total{method="${method}",status="${status}"} ${count}`);
    }
    lines.push("# HELP http_request_duration_seconds HTTP request duration in seconds.");
    lines.push("# TYPE http_request_duration_seconds histogram");
    for (let i = 0; i < BUCKETS.length; i++) {
      lines.push(`http_request_duration_seconds_bucket{le="${BUCKETS[i]}"} ${this.bucketCounts[i]}`);
    }
    lines.push(`http_request_duration_seconds_bucket{le="+Inf"} ${this.bucketCounts[BUCKETS.length]}`);
    lines.push(`http_request_duration_seconds_sum ${this.durationSum}`);
    lines.push(`http_request_duration_seconds_count ${this.durationCount}`);
    return lines.join("\n") + "\n";
  }
}
