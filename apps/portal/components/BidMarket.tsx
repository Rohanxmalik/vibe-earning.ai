import { rupees, compactInt } from "../lib/format";

export interface BidRow { name: string; url?: string; cpmPaise: number }

/** Live bid-market panel: blended price + fleet impressions + ranked leaderboard. */
export function BidMarket({ rows, marketPricePaise, impressionsPerHour }: {
  rows: BidRow[];
  marketPricePaise: number;
  impressionsPerHour: number;
}) {
  return (
    <div className="card card-pad-lg">
      <div className="card-title" style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>Bid Market</h2>
        <div className="seg" role="group" aria-label="Chart range">
          <button className="seg-btn active" type="button">24h</button>
          <button className="seg-btn" type="button">All</button>
        </div>
      </div>

      <div className="market-summary">
        <div className="market-stat">
          <div className="stat-kicker">Market price</div>
          <div className="v">{rupees(marketPricePaise)}</div>
          <div className="s">blended · per 1k impressions</div>
        </div>
        <div className="market-stat">
          <div className="stat-kicker">Impressions / hr</div>
          <div className="v">{compactInt(impressionsPerHour)}</div>
          <div className="s">billable · fleet-wide</div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Campaign</th>
              <th className="num">₹ / 1,000 impressions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="muted">{i + 1}</td>
                <td>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer">{r.name} ↗</a>
                  ) : r.name}
                </td>
                <td className="num">{rupees(r.cpmPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
