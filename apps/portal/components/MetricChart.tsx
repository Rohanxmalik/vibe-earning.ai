/** Dependency-free SVG area/line chart. Pure, responsive via viewBox. */
export interface ChartPoint { label: string; value: number }

export function MetricChart({ points, color = "var(--brand)", valueFmt = (n) => `${Math.round(n)}`, height = 160, ariaLabel = "Activity chart" }: {
  points: ChartPoint[];
  color?: string;
  valueFmt?: (n: number) => string;
  height?: number;
  ariaLabel?: string;
}) {
  if (points.length === 0) return <p className="empty">No activity in this window yet.</p>;

  const w = 720, h = height, padX = 8, padTop = 12, padBottom = 22;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;
  const max = Math.max(...points.map((p) => p.value), 1);
  const n = points.length;
  const x = (i: number) => padX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padTop + innerH - (v / max) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(n - 1).toFixed(1)} ${padTop + innerH} L ${x(0).toFixed(1)} ${padTop + innerH} Z`;

  // sparse x labels: first, middle, last
  const labelIdx = n <= 8 ? points.map((_, i) => i) : [0, Math.floor(n / 2), n - 1];
  const allZero = points.every((p) => p.value === 0);

  return (
    <div className="chart-wrap">
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none" style={{ display: "block" }}>
        <defs>
          <linearGradient id="kb-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* baseline */}
        <line x1={padX} y1={padTop + innerH} x2={w - padX} y2={padTop + innerH} stroke="var(--line)" strokeWidth="1" />
        {!allZero && <path d={areaPath} fill="url(#kb-chart-fill)" />}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={n > 24 ? 0 : 2.4} fill={color} />
            <title>{`${p.label}: ${valueFmt(p.value)}`}</title>
          </g>
        ))}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={h - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted)">
            {points[i].label}
          </text>
        ))}
      </svg>
    </div>
  );
}
