import type { StatusSink } from "../adapters/claudeCode";

/** Minimal slice of vscode.StatusBarItem we use (so tests need no vscode). */
export interface StatusItemLike {
  text: string;
  show(): void;
  hide(): void;
}

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

  write(line: string, url?: string): void {
    try {
      this.url = url;
      this.item.text = `$(sparkle) ${line}`;
      this.item.show();
    } catch {
      /* never break the editor over a render failure */
    }
  }

  restore(): void {
    try {
      this.item.hide();
    } catch {
      /* best-effort */
    }
  }
}
