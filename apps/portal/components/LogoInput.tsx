"use client";
import { useRef, useState } from "react";
import { ACCEPTED_LOGO_TYPES, logoFileError, isSafeLogoUrl } from "../lib/brand";

/**
 * A single logo field that accepts EITHER a small uploaded image (drag/drop or pick → stored inline
 * as a base64 data URI) OR a pasted https URL. Both end up as the campaign's `iconUrl` string.
 * Live-previews the result and surfaces validation errors (wrong type / too large / unsafe URL).
 */
export function LogoInput({
  value,
  onChange,
  accent,
  uploader,
}: {
  value: string;
  onChange: (next: string) => void;
  accent?: string;
  /** Uploads the file (as a data URI) to object storage and resolves the hosted URL. When absent,
   * the image is kept inline as a data URI (back-compat / tests). */
  uploader?: (dataUrl: string) => Promise<string>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isData = value.startsWith("data:");
  const urlText = isData ? "" : value; // never dump a giant data URI into the URL box

  function readFile(file: File | null | undefined) {
    if (!file) return;
    const e = logoFileError(file);
    if (e) {
      setError(e);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      if (!uploader) {
        setError(null);
        onChange(dataUrl);
        return;
      }
      // Upload to object storage so the campaign stores a short URL, not a fat inline blob.
      setBusy(true);
      setError(null);
      uploader(dataUrl)
        .then((url) => onChange(url))
        .catch(() => {
          onChange(dataUrl); // graceful fallback: keep it inline if storage is unreachable
          setError("Couldn’t reach storage — keeping an inline copy for now.");
        })
        .finally(() => setBusy(false));
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsDataURL(file);
  }

  function clear() {
    setError(null);
    onChange("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="field">
      <label className="label">Logo (optional)</label>
      <div
        className="row"
        style={{
          gap: "0.75rem",
          alignItems: "center",
          padding: "0.6rem",
          borderRadius: "0.6rem",
          border: `1px dashed ${dragging ? accent ?? "#2563EB" : "rgba(0,0,0,0.18)"}`,
          background: dragging ? "rgba(37,99,235,0.05)" : undefined,
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          readFile(e.dataTransfer.files?.[0]);
        }}
      >
        <div
          aria-hidden
          style={{
            width: "2.5rem",
            height: "2.5rem",
            flex: "0 0 2.5rem",
            borderRadius: "0.5rem",
            border: "1px solid rgba(0,0,0,0.12)",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URIs / arbitrary hosts, not Next-optimizable
            <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <span style={{ opacity: 0.4, fontSize: "1.1rem" }}>🏷️</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            className="input"
            placeholder="Paste an https logo URL…"
            value={urlText}
            onChange={(e) => {
              setError(null);
              onChange(e.target.value.trim());
            }}
          />
          <div className="row" style={{ gap: "0.5rem", marginTop: "0.4rem", alignItems: "center" }}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? "Uploading…" : "⬆ Upload"}
            </button>
            <span className="hint" style={{ margin: 0 }}>or drag an image here · max 32KB</span>
            {value && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clear} style={{ marginLeft: "auto" }}>
                Remove
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_LOGO_TYPES.join(",")}
          style={{ display: "none" }}
          onChange={(e) => readFile(e.target.files?.[0])}
        />
      </div>
      {error && (
        <div className="hint" style={{ color: "#B45309" }}>
          ⚠ {error}
        </div>
      )}
      {value && !error && !isSafeLogoUrl(value) && (
        <div className="hint" style={{ color: "#B45309" }}>
          ⚠ Logo must be an https URL or an uploaded image.
        </div>
      )}
    </div>
  );
}
