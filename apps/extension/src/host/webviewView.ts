import * as vscode from "vscode";
import type { ServeResponse } from "@vibearning/shared";
import { adViewModel, webviewHtml, type AdView } from "./webviewContent";

/** A random CSP nonce (per webview load) so inline script/style run under the locked policy. */
function makeNonce(): string {
  let s = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * The sidebar "vibearning" panel: a rich, branded ad card + live earnings, shown in its own
 * Activity-Bar view. It mirrors the same ad the status-bar line shows (driven by the Orchestrator's
 * onShow/onHide hooks), but with room for the brand emoji, headline, tagline and accent color.
 *
 * State (`lastAd`, `lastEarnings`) is retained so the card repaints correctly whenever the view is
 * (re)mounted — e.g. the user opens the panel mid-wait, or VS Code reclaims a hidden webview.
 * All host interaction is fail-safe: a posting/render error must never break the editor.
 */
export class vibearningViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "vibearning.adView";

  private view: vscode.WebviewView | undefined;
  private lastLineup: AdView[] = [];
  private lastActiveId: string | null = null;
  private lastEarnings: { text: string; signedIn: boolean; session?: string } = { text: "Sign in to earn", signedIn: false };

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = webviewHtml({ nonce: makeNonce(), cspSource: view.webview.cspSource });

    view.webview.onDidReceiveMessage((msg: { type?: string }) => {
      switch (msg?.type) {
        case "signIn": void vscode.commands.executeCommand("vibearning.signIn"); break;
        case "signOut": void vscode.commands.executeCommand("vibearning.signOut"); break;
        case "openSponsor": void vscode.commands.executeCommand("vibearning.openSponsor"); break;
        case "openDashboard": void vscode.commands.executeCommand("vibearning.openDashboard"); break;
      }
    });

    // Track on-screen state: pause the live pulse when the panel is hidden, and re-sync the latest
    // ad/earnings when it returns (covers anything pushed while it was offscreen).
    view.onDidChangeVisibility(() => {
      this.post({ type: "visibility", visible: view.visible });
      if (view.visible) this.repaint();
    });

    this.repaint();
  }

  /** Push the current line-up + earnings state — used on (re)mount and when the panel returns. */
  private repaint(): void {
    this.post({ type: "earnings", ...this.lastEarnings });
    this.post(
      this.lastLineup.length > 0
        ? { type: "ad", activeId: this.lastActiveId, lineup: this.lastLineup }
        : { type: "idle" },
    );
  }

  /**
   * An ad just became visible (first show or a rotation). `context.lineup` is the full served set;
   * the card shows the live (billed) ad big and the rest as dimmed "up next" rows. Falls back to a
   * single-ad line-up when no context is given (e.g. the dev preview command).
   */
  showAd(ad: ServeResponse, context?: { lineup: ServeResponse[]; activeIndex: number }): void {
    const ads = context?.lineup && context.lineup.length > 0 ? context.lineup : [ad];
    this.lastLineup = ads.map(adViewModel);
    this.lastActiveId = ad.campaignId;
    this.post({ type: "ad", activeId: this.lastActiveId, lineup: this.lastLineup });
  }

  /** The wait ended — leave the last card but mark the slot idle (paused). */
  clearAd(): void {
    this.post({ type: "idle" });
  }

  /**
   * Update the earnings pill + sign-in/out button. `session` is the optional ▲ "this session" delta
   * (formatted, e.g. "₹2.30"); omit/empty to show lifetime only.
   */
  setEarnings(text: string, signedIn: boolean, session?: string): void {
    this.lastEarnings = { text, signedIn, session };
    this.post({ type: "earnings", text, signedIn, session });
  }

  private post(msg: unknown): void {
    try {
      void this.view?.webview.postMessage(msg);
    } catch {
      /* webview gone / disposed — never break the editor over a UI push */
    }
  }
}
