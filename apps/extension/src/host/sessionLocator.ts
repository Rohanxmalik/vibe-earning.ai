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
 * Newest transcript for `cwd`: ONLY the exact slug dir for this workspace. We deliberately do
 * NOT fall back to the globally-newest transcript across other projects — that bleed lets the
 * ad track an unrelated Claude session (e.g. another window, or a CLI session in a different
 * repo), so it would show while THIS workspace is idle. Returns null when this workspace has
 * no transcript yet (so the ad stays hidden until the user actually prompts here).
 */
export function findNewestTranscript(cwd: string, fs: LocatorFs): string | null {
  const projects = join(fs.homedir(), ".claude", "projects");
  return newestIn(join(projects, projectSlug(cwd)), fs)?.path ?? null;
}
