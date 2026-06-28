import { join } from "node:path";

/** Filesystem facade (injected so the locator is unit-testable without real disk). */
export interface LocatorFs {
  homedir(): string;
  /** `*.jsonl` entries (name + mtimeMs) directly in `dir`; [] if the dir is missing. */
  listJsonl(dir: string): { name: string; mtimeMs: number }[];
  /** Subdirectory names directly in `dir`; [] if the dir is missing. */
  listDirs(dir: string): string[];
}

/**
 * Claude Code names each project's transcript folder after the cwd with every
 * non-alphanumeric character replaced by a dash, e.g.
 * `c:\\Users\\dev\\app.ts` -> `c--Users-dev-app-ts`.
 */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

function newestIn(dir: string, fs: LocatorFs): { path: string; mtimeMs: number } | null {
  let best: { path: string; mtimeMs: number } | null = null;
  for (const f of fs.listJsonl(dir)) {
    if (!best || f.mtimeMs > best.mtimeMs) best = { path: join(dir, f.name), mtimeMs: f.mtimeMs };
  }
  return best;
}

/**
 * Newest transcript for `cwd`: prefer the exact slug dir; if it has none, fall back
 * to the globally-newest transcript across all project dirs (robust to slug drift).
 */
export function findNewestTranscript(cwd: string, fs: LocatorFs): string | null {
  const projects = join(fs.homedir(), ".claude", "projects");
  const direct = newestIn(join(projects, projectSlug(cwd)), fs);
  if (direct) return direct.path;

  let best: { path: string; mtimeMs: number } | null = null;
  for (const sub of fs.listDirs(projects)) {
    const cand = newestIn(join(projects, sub), fs);
    if (cand && (!best || cand.mtimeMs > best.mtimeMs)) best = cand;
  }
  return best?.path ?? null;
}
