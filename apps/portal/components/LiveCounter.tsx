"use client";
import { useEffect, useRef, useState } from "react";

type Format = "inrFromPaise" | "int";

function fmt(n: number, format: Format): string {
  if (format === "inrFromPaise") return `₹${Math.round(n / 100).toLocaleString("en-IN")}`;
  return Math.round(n).toLocaleString("en-IN");
}

/**
 * Counts up to `value` once, when first scrolled into view.
 * `format` is serializable so this client component can be used from a server component.
 */
export function LiveCounter({ value, format = "int", durationMs = 1100 }: { value: number; format?: Format; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setN(value); return; }

    const run = () => {
      if (started.current) return;
      started.current = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / durationMs);
        const eased = 1 - Math.pow(1 - p, 3);
        setN(value * eased);
        if (p < 1) requestAnimationFrame(tick);
        else setN(value);
      };
      requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === "undefined") { run(); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { run(); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [value, durationMs]);

  return <span ref={ref}>{fmt(n, format)}</span>;
}
