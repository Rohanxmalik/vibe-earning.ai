"use client";
import { useState } from "react";

/** Share/copy buttons for the earnings card. Client-only (clipboard + window). */
export function ShareActions({ caption, url }: { caption: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}&url=${encodeURIComponent(url)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${caption} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      <a
        href={tweet}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center rounded-lg bg-[#15171E] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-black"
      >
        Share on X
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center justify-center rounded-lg border border-[#15171E]/25 px-6 py-3 text-sm font-semibold text-[#15171E] transition-colors hover:bg-[#15171E] hover:text-white"
      >
        {copied ? "Copied ✓" : "Copy caption"}
      </button>
    </div>
  );
}
