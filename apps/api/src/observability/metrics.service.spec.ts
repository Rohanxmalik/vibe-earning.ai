import { MetricsService } from "./metrics.service";

describe("MetricsService", () => {
  it("renders request counters in Prometheus format", () => {
    const m = new MetricsService();
    m.recordRequest("GET", 200, 0.02);
    m.recordRequest("GET", 200, 0.2);
    m.recordRequest("POST", 500, 1.5);
    const out = m.render();
    expect(out).toContain("# TYPE http_requests_total counter");
    expect(out).toContain('http_requests_total{method="GET",status="200"} 2');
    expect(out).toContain('http_requests_total{method="POST",status="500"} 1');
  });

  it("renders a cumulative duration histogram with sum and count", () => {
    const m = new MetricsService();
    m.recordRequest("GET", 200, 0.2); // falls in le>=0.5
    m.recordRequest("GET", 200, 3); // falls in le>=5
    const out = m.render();
    expect(out).toContain("# TYPE http_request_duration_seconds histogram");
    expect(out).toContain('http_request_duration_seconds_bucket{le="+Inf"} 2');
    expect(out).toContain("http_request_duration_seconds_count 2");
    expect(out).toMatch(/http_request_duration_seconds_sum 3\.2\d*/);
    // 0.2 is <= 0.5 but not <= 0.1
    expect(out).toContain('http_request_duration_seconds_bucket{le="0.1"} 0');
    expect(out).toContain('http_request_duration_seconds_bucket{le="0.5"} 1');
  });
});
