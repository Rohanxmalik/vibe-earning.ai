/** Animated "stock spinner vs sponsored line" comparison, dark-terminal styled. */
export function SpinnerDemo() {
  return (
    <div className="demo-grid" aria-label="Spinner comparison">
      <div>
        <div className="demo-label">Stock Claude Code</div>
        <div className="term">
          <div className="term-row">
            <span className="term-left">
              <span className="term-star">✻</span>
              <span className="term-verb">Simmering<span className="term-dots" /></span>
            </span>
            <span className="term-meta">Glob · 0.4s</span>
          </div>
        </div>
      </div>

      <div className="demo-arrow" aria-hidden="true">→</div>

      <div>
        <div className="demo-label">With vibearning</div>
        <div className="term">
          <div className="term-row">
            <span className="term-left">
              <span className="term-star">✻</span>
              <span className="term-ad">Ramp · save time and money<span className="term-dots" /></span>
            </span>
            <span className="term-meta">Glob · 2.8s</span>
          </div>
        </div>
      </div>
    </div>
  );
}
