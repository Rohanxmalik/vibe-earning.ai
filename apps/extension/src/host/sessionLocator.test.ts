import { describe, it, expect } from "vitest";
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

function fakeFs(layout: Record<string, { name: string; mtimeMs: number }[]>): LocatorFs {
  return {
    homedir: () => "/home/dev",
    listJsonl: (dir) => layout[dir] ?? [],
    listDirs: (dir) =>
      dir.endsWith("projects")
        ? Object.keys(layout).map((d) => d.split("/").pop() as string)
        : [],
  };
}

describe("findNewestTranscript", () => {
  it("returns the newest jsonl in the exact slug dir", () => {
    const slug = projectSlug("/work/proj"); // -work-proj
    const dir = `/home/dev/.claude/projects/${slug}`;
    const fs = fakeFs({ [dir]: [
      { name: "old.jsonl", mtimeMs: 100 },
      { name: "new.jsonl", mtimeMs: 200 },
    ]});
    expect(findNewestTranscript("/work/proj", fs)).toBe(`${dir}/new.jsonl`);
  });

  it("falls back to the globally-newest jsonl when the slug dir is empty", () => {
    const other = "/home/dev/.claude/projects/-other-proj";
    const fs = fakeFs({ [other]: [{ name: "s.jsonl", mtimeMs: 500 }] });
    expect(findNewestTranscript("/work/proj", fs)).toBe(`${other}/s.jsonl`);
  });

  it("returns null when there are no transcripts anywhere", () => {
    expect(findNewestTranscript("/work/proj", fakeFs({}))).toBeNull();
  });
});
