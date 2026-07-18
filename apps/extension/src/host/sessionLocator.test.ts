import { describe, it, expect } from "vitest";
import { join, basename } from "node:path";
import { projectSlug, findNewestTranscript, type LocatorFs } from "./sessionLocator";

describe("projectSlug", () => {
  it("replaces non-alphanumerics with dashes (Windows path)", () => {
    expect(projectSlug("c:\\Users\\dev\\Desktop\\vibe-earning.ai"))
      .toBe("c--Users-dev-Desktop-vibe-earning-ai");
  });
  it("replaces non-alphanumerics with dashes (POSIX path)", () => {
    expect(projectSlug("/home/dev/my.proj")).toBe("-home-dev-my-proj");
  });
});

const HOME = join("/home", "dev");
const PROJECTS = join(HOME, ".claude", "projects");

/** Fake FS whose layout keys are real (native-join) dir paths. */
function makeFs(layout: Record<string, { name: string; mtimeMs: number }[]>): LocatorFs {
  return {
    homedir: () => HOME,
    listJsonl: (dir) => layout[dir] ?? [],
    listDirs: (dir) => (dir === PROJECTS ? Object.keys(layout).map((d) => basename(d)) : []),
  };
}

describe("findNewestTranscript", () => {
  it("returns the newest jsonl in the exact slug dir", () => {
    const dir = join(PROJECTS, projectSlug("/work/proj"));
    const fs = makeFs({ [dir]: [
      { name: "old.jsonl", mtimeMs: 100 },
      { name: "new.jsonl", mtimeMs: 200 },
    ]});
    expect(findNewestTranscript("/work/proj", fs)).toBe(join(dir, "new.jsonl"));
  });

  it("does NOT bleed to another project's transcript when this slug dir is empty", () => {
    // A different project has a (newer) transcript — we must ignore it, not track it.
    const other = join(PROJECTS, projectSlug("/some/other"));
    const fs = makeFs({ [other]: [{ name: "s.jsonl", mtimeMs: 500 }] });
    expect(findNewestTranscript("/work/proj", fs)).toBeNull();
  });

  it("returns null when there are no transcripts anywhere", () => {
    expect(findNewestTranscript("/work/proj", makeFs({}))).toBeNull();
  });

  it("matches the slug case-insensitively (VS Code uppercases the drive letter; Claude lowercases it)", () => {
    const stored = join(PROJECTS, "c--users-dev-proj"); // Claude stored it lowercased
    const fs = makeFs({ [stored]: [{ name: "t.jsonl", mtimeMs: 10 }] });
    expect(findNewestTranscript("C:\\users\\dev\\proj", fs)).toBe(join(stored, "t.jsonl")); // we get an uppercase drive
  });
});
