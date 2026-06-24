"use client";
import { useState } from "react";

/** Copies `text` to the clipboard and briefly confirms. */
export function CopyButton({ text, label = "Copy", className = "btn btn-ghost btn-sm" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" className={className} onClick={copy} aria-live="polite">
      {copied ? "Copied ✓" : label}
    </button>
  );
}
