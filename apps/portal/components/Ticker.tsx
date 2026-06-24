export interface TickerItem { name: string; copy: string }

/** Infinite marquee of live ad lines. Track is duplicated for a seamless loop. */
export function Ticker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  const row = (key: string) => (
    <div className="ticker-track" key={key} aria-hidden={key === "b"}>
      {items.map((it, i) => (
        <span className="ticker-item" key={`${key}-${i}`}>
          <span className="ticker-name">{it.name}</span>
          <span className="ticker-dot">·</span>
          <span>{it.copy}</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="ticker" role="marquee" aria-label="Live sponsored lines">
      {row("a")}
      {row("b")}
    </div>
  );
}
