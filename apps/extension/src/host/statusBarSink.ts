import type { StatusSink } from "../adapters/claudeCode";

/**
 * Foreground tint of the status item. We only ever set a hex string (or clear it), but the real
 * `vscode.StatusBarItem.color` is `string | ThemeColor | undefined`. ThemeColor is opaque in the
 * typings (no public members), so an optional-`id` object accepts it structurally — keeping this
 * interface vscode-free while staying assignable from the real item.
 */
export type StatusItemColor = string | { readonly id?: string } | undefined;

/** Minimal slice of vscode.StatusBarItem we use (so tests need no vscode). */
export interface StatusItemLike {
  text: string;
  color?: StatusItemColor;
  show(): void;
  hide(): void;
}

/** Shown in the ad slot between turns, once at least one ad has been displayed. */
export const AD_SHOWN_BADGE = "$(check) Ad shown";

/**
 * Renders the composed sponsored line into a VS Code status bar item, and remembers the
 * current ad URL so a click command can open it. Fail-safe: never throws into the editor.
 */
export class StatusBarSink implements StatusSink {
  private url: string | undefined;

  constructor(private readonly item: StatusItemLike) {}

  /** The URL of the ad currently shown (for the click command). */
  currentUrl(): string | undefined {
    return this.url;
  }

  write(line: string, url?: string, color?: string): void {
    try {
      this.url = url;
      this.item.text = `$(sparkle) ${line}`;
      this.item.color = color; // brand tint (undefined => theme default)
      this.item.show();
    } catch {
      /* never break the editor over a render failure */
    }
  }

  /**
   * Called when the turn ends. Rather than hiding, leave an "Ad shown" badge in the same slot
   * so the confirmation appears where the ad was — not on the earnings item. Clears the brand
   * tint so the badge renders in the normal theme color.
   */
  restore(): void {
    try {
      this.item.text = AD_SHOWN_BADGE;
      this.item.color = undefined;
      this.item.show();
    } catch {
      /* best-effort */
    }
  }
}
