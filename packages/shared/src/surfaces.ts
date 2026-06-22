import { z } from "zod";

export const SURFACES = [
  "claude-code-panel",
  "claude-code-terminal",
  "codex-panel",
  "gemini-cli-terminal",
] as const;

export type Surface = (typeof SURFACES)[number];

export const surfaceSchema = z.enum(SURFACES);
