import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import type { BillingState } from "./billing";

// Local config the standalone status-line script reads (it has no VS Code SecretStorage).
const DIR = join(homedir(), ".kickbacks");
const STATE_FILE = join(DIR, "statusline-state.json");
const TOKEN_FILE = join(DIR, "token");

/** The dev's session token: env wins, else `~/.kickbacks/token`, else undefined (anonymous). */
export function loadToken(): string | undefined {
  if (process.env.KICKBACKS_TOKEN) return process.env.KICKBACKS_TOKEN;
  try {
    const t = readFileSync(TOKEN_FILE, "utf8").trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

export function loadState(): BillingState {
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, "utf8")) as BillingState;
    if (raw && typeof raw.installId === "string") return raw;
  } catch {
    /* fall through to a fresh state */
  }
  return { installId: `inst_${randomBytes(8).toString("hex")}`, current: null };
}

export function saveState(state: BillingState): void {
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {
    /* best-effort; never break the status line over a write failure */
  }
}
