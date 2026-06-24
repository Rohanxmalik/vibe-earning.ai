import { surfaceSchema, type Surface } from "@kbi/shared";

const DEFAULT_SURFACE: Surface = "claude-code-terminal";

/**
 * Resolve which ad surface this status-line invocation serves. Lets the SAME script
 * back Claude Code, Codex, or Gemini by setting KICKBACKS_SURFACE — falling back to
 * Claude Code's terminal surface for any unset/unknown value.
 */
export function resolveSurface(value: string | undefined): Surface {
  const parsed = surfaceSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_SURFACE;
}
